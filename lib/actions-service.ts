// lib/actions-service.ts (PG async-ready)
import { nanoid } from "nanoid";
import { logger } from "./logger";
import { getYouTubeClient } from "./google";
import { parseYouTubeError } from "./errors";
import {
  createAction,
  createActionItems,
  getActionById,
  getActionCounts,
  listActionItems,
  setActionStatus,
  updateActionItem,
} from "./actions-store";
import type { ActionType } from "@/types/actions";
import type {
  ActionCounts,
  ActionItemRecord,
  ActionRecord,
} from "@/types/actions";

import type {
  BulkMovePayload,
  BulkAddPayload,
  BulkRemovePayload,
} from "@/validators/bulk";

import { recordQuota, METHOD_COST } from "@/lib/quota";

export interface OperationResult {
  action: ActionRecord;
  items: ActionItemRecord[];
  counts: ActionCounts;
  estimatedQuota: number;
  usingMock: boolean;
}

const INSERT_DELETE_QUOTA_COST = 50;

/** 序列化時的重試（含指數退避 + 抖動） */
async function retryTransient<T>(
  fn: () => Promise<T>,
  {
    retries = 5,
    baseMs = 300,
    maxMs = 3000,
  }: { retries?: number; baseMs?: number; maxMs?: number } = {}
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const parsed = parseYouTubeError(e);
      const code = (parsed.code || "").toUpperCase();
      const msg = (parsed.message || "").toLowerCase();

      const isTransient =
        code === "SERVICE_UNAVAILABLE" ||
        code === "ABORTED" ||
        msg.includes("aborted") ||
        msg.includes("temporary") ||
        msg.includes("unavailable") ||
        msg.includes("backend error");

      if (!isTransient || i === retries) break;

      const delay =
        Math.min(baseMs * Math.pow(2, i), maxMs) * (1 + Math.random() * 0.3);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** 封裝結案＋統計（PG 版全 async） */
async function finalize(actionId: string) {
  const counts = await getActionCounts(actionId);
  const status =
    counts.total === 0
      ? "success"
      : counts.failed === counts.total
      ? "failed"
      : counts.failed > 0
      ? "partial"
      : "success";

  const finalAction = await setActionStatus(
    actionId,
    status,
    new Date().toISOString()
  );
  const items = await listActionItems(actionId);
  return { finalAction, counts, items };
}

/* =========================
 * MOVE
 * ========================= */
export async function performBulkMove(
  payload: BulkMovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = await createAction({
    id: options.actionId,
    userId: options.userId,
    type: "MOVE",
    sourcePlaylistId: payload.sourcePlaylistId,
    targetPlaylistId: payload.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const items = await createActionItems(
    payload.items.map((it) => ({
      actionId: action.id,
      type: "MOVE" as ActionType,
      sourcePlaylistId: payload.sourcePlaylistId,
      targetPlaylistId: payload.targetPlaylistId,
      sourcePlaylistItemId: it.playlistItemId,
      videoId: it.videoId,
    }))
  );

  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = payload.items.length * INSERT_DELETE_QUOTA_COST * 2;

  if (!client) {
    for (const item of items) {
      await updateActionItem(item.id, {
        status: "success",
        targetPlaylistItemId: `mock-${item.videoId}`,
      });
    }
    const {
      finalAction,
      counts,
      items: finalItems,
    } = await finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  // 1) 逐筆插入目標
  const insertedSucceeded: ActionItemRecord[] = [];
  for (const item of items) {
    try {
      await recordQuota(
        "playlistItems.insert",
        METHOD_COST["playlistItems.insert"],
        options.userId
      );

      const resp = await retryTransient(() =>
        client.playlistItems.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: payload.targetPlaylistId,
              resourceId: {
                kind: "youtube#video",
                videoId: item.videoId ?? undefined,
              },
            },
          },
        })
      );
      const newId = resp.data.id ?? `mock-${nanoid(8)}`;
      await updateActionItem(item.id, { targetPlaylistItemId: newId });
      insertedSucceeded.push(item);

      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      await updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error(
        { err: e, itemId: item.id },
        "Failed to insert playlist item while moving"
      );
    }
  }

  // 2) 逐筆刪除來源（只刪有成功插入者）
  for (const item of insertedSucceeded) {
    if (!item.sourcePlaylistItemId) {
      await updateActionItem(item.id, {
        status: "failed",
        errorCode: "MISSING_SOURCE_ID",
        errorMessage: "Missing source playlist item id",
      });
      continue;
    }
    try {
      await recordQuota(
        "playlistItems.delete",
        METHOD_COST["playlistItems.delete"],
        options.userId
      );

      await retryTransient(() =>
        client.playlistItems.delete({ id: item.sourcePlaylistItemId! })
      );
      await updateActionItem(item.id, { status: "success" });
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      await updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code || "DELETE_FAILED",
        errorMessage: parsed.message || "Failed to delete source playlist item",
      });
      logger.error(
        { err: e, itemId: item.id },
        "Failed to delete source playlist item during move"
      );
    }
  }

  const { finalAction, counts, items: finalItems } = await finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

/* =========================
 * REMOVE
 * ========================= */
export async function performBulkRemove(
  payload: BulkRemovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = await createAction({
    id: options.actionId,
    userId: options.userId,
    type: "REMOVE",
    sourcePlaylistId: (payload as any).sourcePlaylistId ?? null,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const uniqueIds = Array.from(new Set(payload.playlistItemIds ?? []));
  const items = await createActionItems(
    uniqueIds.map((playlistItemId: string) => ({
      actionId: action.id,
      type: "REMOVE" as ActionType,
      sourcePlaylistItemId: playlistItemId,
      sourcePlaylistId: (payload as any).sourcePlaylistId ?? null,
      videoId: null,
    }))
  );

  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = uniqueIds.length * INSERT_DELETE_QUOTA_COST;

  if (!client) {
    for (const it of items) {
      await updateActionItem(it.id, { status: "success" });
    }
    const {
      finalAction,
      counts,
      items: finalItems,
    } = await finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  const isIdempotentNotFound = (code?: string, msg?: string) => {
    const c = (code || "").toLowerCase();
    const m = (msg || "").toLowerCase();
    return c === "playlistitemnotfound" || m.includes("not found");
  };

  for (const it of items) {
    if (!it.sourcePlaylistItemId) {
      await updateActionItem(it.id, {
        status: "failed",
        errorCode: "MISSING_PLAYLIST_ITEM_ID",
        errorMessage: "Missing playlist item identifier",
      });
      continue;
    }

    try {
      await recordQuota(
        "playlistItems.delete",
        METHOD_COST["playlistItems.delete"],
        options.userId
      );

      await retryTransient(() =>
        client.playlistItems.delete({ id: it.sourcePlaylistItemId! })
      );
      await updateActionItem(it.id, { status: "success" });
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      const parsed = parseYouTubeError(e);

      if (isIdempotentNotFound(parsed.code, parsed.message)) {
        await updateActionItem(it.id, { status: "success" });
        logger.info(
          { itemId: it.id, playlistItemId: it.sourcePlaylistItemId },
          "Remove treated as success (already removed)"
        );
        continue;
      }

      await updateActionItem(it.id, {
        status: "failed",
        errorCode: parsed.code || "DELETE_FAILED",
        errorMessage: parsed.message || "Failed to delete playlist item",
      });
      logger.error({ err: e, itemId: it.id }, "Failed to remove playlist item");
    }
  }

  const { finalAction, counts, items: finalItems } = await finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

/* =========================
 * ADD
 * ========================= */
// === 新增：批次新增到某播放清單（序列化 + 指數退避重試）===
export async function performBulkAdd(
  payload: BulkAddPayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  // ------- 1) 強韌解析輸入（避免 videoIds 為 undefined） -------
  const raw = (payload as any) ?? {};
  let ids: string[] = [];

  if (Array.isArray(raw.videoIds)) {
    ids = raw.videoIds.filter(
      (v: unknown): v is string => typeof v === "string" && v.length > 0
    );
  } else if (Array.isArray(raw.items)) {
    // 兼容誤傳 { items: [{ videoId }] }
    ids = raw.items
      .map((x: any) => (x ? x.videoId : null))
      .filter(
        (v: unknown): v is string => typeof v === "string" && v.length > 0
      );
  }

  if (!raw.targetPlaylistId || typeof raw.targetPlaylistId !== "string") {
    throw new Error("invalid_request: targetPlaylistId missing");
  }
  // 若沒任何 id，直接回成功（無事可做）
  if (ids.length === 0) {
    const noop = await createAction({
      id: options.actionId,
      userId: options.userId,
      type: "ADD",
      targetPlaylistId: raw.targetPlaylistId,
      status: "success",
      parentActionId: options.parentActionId ?? null,
    });
    return {
      action: noop,
      items: [],
      counts: { total: 0, success: 0, failed: 0 },
      estimatedQuota: 0,
      usingMock: false,
    };
  }

  // ------- 2) 建 action -------
  const action = await createAction({
    id: options.actionId,
    userId: options.userId,
    type: "ADD",
    targetPlaylistId: raw.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  // 去重後建立 items（一定是陣列）
  ids = Array.from(new Set(ids));
  const items = await createActionItems(
    ids.map((videoId) => ({
      actionId: action.id,
      type: "ADD" as ActionType,
      videoId,
      targetPlaylistId: raw.targetPlaylistId,
    }))
  );

  // ------- 3) 建 YouTube client -------
  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = ids.length * INSERT_DELETE_QUOTA_COST;

  // ------- 4) 無 client（mock）→ 視為成功 -------
  if (!client) {
    for (const it of items) {
      await updateActionItem(it.id, {
        status: "success",
        targetPlaylistItemId: `mock-${it.videoId}`,
      });
    }
    const {
      finalAction,
      counts,
      items: finalItems,
    } = await finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  // ------- 5) 逐筆 insert + 重試 -------
  for (const it of items) {
    try {
      await recordQuota(
        "playlistItems.insert",
        METHOD_COST["playlistItems.insert"],
        options.userId
      );

      const resp = await retryTransient(() =>
        client.playlistItems.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: raw.targetPlaylistId,
              resourceId: {
                kind: "youtube#video",
                videoId: it.videoId ?? undefined,
              },
            },
          },
        })
      );

      const newId = resp.data.id ?? `mock-${nanoid(8)}`;
      await updateActionItem(it.id, {
        status: "success",
        targetPlaylistItemId: newId,
      });

      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      await updateActionItem(it.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error(
        { err: e, itemId: it.id },
        "Failed to add video to playlist"
      );
    }
  }

  const { finalAction, counts, items: finalItems } = await finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

/* =========================
 * Summary
 * ========================= */
export async function getActionSummary(actionId: string): Promise<{
  action: ActionRecord;
  counts: ActionCounts;
  items: ActionItemRecord[];
} | null> {
  const action = await getActionById(actionId);
  if (!action) return null;
  const counts = await getActionCounts(actionId);
  const items = await listActionItems(actionId);
  return { action, counts, items };
}
