import { nanoid } from "nanoid";
import { runInBatches } from "./batch";
import { logger } from "./logger";
import { getYouTubeClient } from "./google";
import {
  createAction,
  createActionItems,
  getActionById,
  getActionCounts,
  listActionItems,
  setActionStatus,
  updateActionItem,
} from "./actions-store";
import type { ActionCounts, ActionItemRecord, ActionRecord, ActionType } from "@/types/actions";
import type {
  BulkAddPayload,
  BulkMovePayload,
  BulkRemovePayload,
} from "@/validators/bulk";
import { parseYouTubeError } from "./errors";

export interface OperationResult {
  action: ActionRecord;
  items: ActionItemRecord[];
  counts: ActionCounts;
  estimatedQuota: number;
  usingMock: boolean;
}

const INSERT_DELETE_QUOTA_COST = 50;
const LIST_QUOTA_COST = 1;

function finalizeAction(actionId: string) {
  const counts = getActionCounts(actionId);
  const status = counts.total === 0
    ? "success"
    : counts.failed === counts.total
      ? "failed"
      : counts.failed > 0
        ? "partial"
        : "success";
  const finalAction = setActionStatus(actionId, status, new Date().toISOString());
  const items = listActionItems(actionId);
  return { finalAction, counts, items };
}

async function ensureYouTubeClient(userId: string) {
  try {
    return await getYouTubeClient(userId);
  } catch (error) {
    logger.error({ err: error }, "Failed to create YouTube client");
    return null;
  }
}

export async function performBulkAdd(
  payload: BulkAddPayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "ADD",
    targetPlaylistId: payload.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const items = createActionItems(
    payload.videoIds.map((videoId) => ({
      actionId: action.id,
      type: "ADD" as ActionType,
      videoId,
      targetPlaylistId: payload.targetPlaylistId,
    }))
  );

  const client = await ensureYouTubeClient(options.userId);
  const usingMock = !client;
  const estimatedQuota = payload.videoIds.length * INSERT_DELETE_QUOTA_COST;

  if (!client) {
    for (const item of items) {
      updateActionItem(item.id, {
        status: "success",
        targetPlaylistItemId: `mock-${item.videoId}`,
      });
    }
    const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  await runInBatches(items, async (item) => {
    try {
      const response = await client.playlistItems.insert({
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
      });
      const playlistItemId = response.data.id ?? `mock-${nanoid(8)}`;
      updateActionItem(item.id, {
        status: "success",
        targetPlaylistItemId: playlistItemId,
      });
      return playlistItemId;
    } catch (error) {
      const parsed = parseYouTubeError(error);
      updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error({ err: error, itemId: item.id }, "Failed to add video to playlist");
      return undefined;
    }
  });

  const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

async function preloadPlaylistItems(
  client: Awaited<ReturnType<typeof getYouTubeClient>>,
  ids: string[]
) {
  if (!client || ids.length === 0) {
    return new Map<string, { playlistId: string | null; videoId: string | null }>();
  }
  const info = new Map<string, { playlistId: string | null; videoId: string | null }>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }
  for (const chunk of chunks) {
    try {
      const res = await client.playlistItems.list({
        part: ["snippet"],
        id: chunk,
        maxResults: chunk.length,
      });
      const items = res.data.items ?? [];
      for (const item of items) {
        const snippet = item.snippet;
        if (!item.id) continue;
        info.set(item.id, {
          playlistId: snippet?.playlistId ?? null,
          videoId: snippet?.resourceId?.videoId ?? null,
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to preload playlist item metadata");
    }
  }
  return info;
}

export async function performBulkRemove(
  payload: BulkRemovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "REMOVE",
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const client = await ensureYouTubeClient(options.userId);
  const usingMock = !client;
  const metadata = client
    ? await preloadPlaylistItems(client, payload.playlistItemIds)
    : new Map<string, { playlistId: string | null; videoId: string | null }>();
  const metadataQuota = client ? Math.ceil(payload.playlistItemIds.length / 50) * LIST_QUOTA_COST : 0;
  const estimatedQuota = payload.playlistItemIds.length * INSERT_DELETE_QUOTA_COST + metadataQuota;

  const items = createActionItems(
    payload.playlistItemIds.map((playlistItemId) => {
      const meta = metadata.get(playlistItemId);
      return {
        actionId: action.id,
        type: "REMOVE" as ActionType,
        sourcePlaylistItemId: playlistItemId,
        sourcePlaylistId: meta?.playlistId ?? payload.sourcePlaylistId ?? null,
        videoId: meta?.videoId ?? playlistItemId,
      };
    })
  );

  if (!client) {
    for (const item of items) {
      updateActionItem(item.id, { status: "success" });
    }
    const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  await runInBatches(items, async (item) => {
    if (!item.sourcePlaylistItemId) {
      updateActionItem(item.id, {
        status: "failed",
        errorCode: "missing_playlist_item_id",
        errorMessage: "Missing playlist item identifier",
      });
      return;
    }
    try {
      await client.playlistItems.delete({ id: item.sourcePlaylistItemId });
      updateActionItem(item.id, { status: "success" });
    } catch (error) {
      const parsed = parseYouTubeError(error);
      updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error({ err: error, itemId: item.id }, "Failed to remove playlist item");
    }
  });

  const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

export async function performBulkMove(
  payload: BulkMovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "MOVE",
    sourcePlaylistId: payload.sourcePlaylistId,
    targetPlaylistId: payload.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const items = createActionItems(
    payload.items.map((item) => ({
      actionId: action.id,
      type: "MOVE" as ActionType,
      sourcePlaylistId: payload.sourcePlaylistId,
      targetPlaylistId: payload.targetPlaylistId,
      sourcePlaylistItemId: item.playlistItemId,
      videoId: item.videoId,
    }))
  );

  const client = await ensureYouTubeClient(options.userId);
  const usingMock = !client;
  const estimatedQuota = payload.items.length * INSERT_DELETE_QUOTA_COST * 2;

  if (!client) {
    for (const item of items) {
      updateActionItem(item.id, {
        status: "success",
        targetPlaylistItemId: `mock-${item.videoId}`,
      });
    }
    const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  const insertionResults = await runInBatches(items, async (item) => {
    try {
      const response = await client.playlistItems.insert({
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
      });
      const newId = response.data.id ?? `mock-${nanoid(8)}`;
      updateActionItem(item.id, {
        targetPlaylistItemId: newId,
      });
      return newId;
    } catch (error) {
      const parsed = parseYouTubeError(error);
      updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error({ err: error, itemId: item.id }, "Failed to insert playlist item while moving");
      return undefined;
    }
  });

  const allInsertSucceeded =
    insertionResults.errors.length === 0 &&
    insertionResults.values.every((value) => typeof value === "string");

  if (allInsertSucceeded) {
    await runInBatches(items, async (item) => {
      if (!item.sourcePlaylistItemId) {
        return;
      }
      try {
        await client.playlistItems.delete({ id: item.sourcePlaylistItemId });
        updateActionItem(item.id, { status: "success" });
      } catch (error) {
        const parsed = parseYouTubeError(error);
        updateActionItem(item.id, {
          status: "failed",
          errorCode: parsed.code,
          errorMessage: parsed.message,
        });
        logger.error({ err: error, itemId: item.id }, "Failed to delete source playlist item during move");
      }
    });
  } else {
    items.forEach((item, index) => {
      const value = insertionResults.values[index];
      if (typeof value === "string") {
        updateActionItem(item.id, {
          status: "success",
          targetPlaylistItemId: value,
        });
      }
    });
  }

  const { finalAction, counts, items: finalItems } = finalizeAction(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

export function getActionSummary(actionId: string) {
  const action = getActionById(actionId);
  if (!action) return null;
  const counts = getActionCounts(actionId);
  const items = listActionItems(actionId);
  return { action, counts, items };
}

export async function undoAction(
  originalActionId: string,
  options: { userId: string }
) {
  const summary = getActionSummary(originalActionId);
  if (!summary || summary.action.userId !== options.userId) {
    return null;
  }

  switch (summary.action.type) {
    case "ADD": {
      const playlistItemIds = summary.items
        .map((item) => item.targetPlaylistItemId)
        .filter((value): value is string => Boolean(value));
      const payload: BulkRemovePayload = {
        playlistItemIds,
        idempotencyKey: undefined,
      };
      return performBulkRemove(payload, {
        userId: options.userId,
        parentActionId: originalActionId,
      });
    }
    case "REMOVE": {
      const playlistIds = new Set(
        summary.items
          .map((item) => item.sourcePlaylistId)
          .filter((value): value is string => Boolean(value))
      );
      if (playlistIds.size !== 1) {
        logger.warn(
          { originalActionId },
          "Unable to undo REMOVE action with items from multiple playlists"
        );
        return null;
      }
      const targetPlaylistId = Array.from(playlistIds)[0];
      if (!targetPlaylistId) {
        return null;
      }
      const videoIds = summary.items
        .map((item) => item.videoId)
        .filter((value): value is string => Boolean(value));
      if (videoIds.length === 0) {
        return null;
      }
      const payload: BulkAddPayload = {
        targetPlaylistId,
        videoIds,
        idempotencyKey: undefined,
      };
      return performBulkAdd(payload, {
        userId: options.userId,
        parentActionId: originalActionId,
      });
    }
    case "MOVE": {
      if (!summary.action.targetPlaylistId || !summary.action.sourcePlaylistId) {
        logger.warn({ originalActionId }, "Move action missing playlist identifiers");
        return null;
      }
      const items = summary.items
        .map((item) => {
          if (!item.targetPlaylistItemId || !item.videoId) {
            return null;
          }
          return {
            playlistItemId: item.targetPlaylistItemId,
            videoId: item.videoId,
          };
        })
        .filter((value): value is { playlistItemId: string; videoId: string } => Boolean(value));
      if (items.length === 0) {
        return null;
      }
      const payload: BulkMovePayload = {
        sourcePlaylistId: summary.action.targetPlaylistId,
        targetPlaylistId: summary.action.sourcePlaylistId,
        items,
        idempotencyKey: undefined,
      };
      return performBulkMove(payload, {
        userId: options.userId,
        parentActionId: originalActionId,
      });
    }
    default:
      logger.warn({ originalActionId }, "Undo not supported for this action type");
      return null;
  }
}

export async function retryFailed(
  actionId: string,
  options: { userId: string }
) {
  const summary = getActionSummary(actionId);
  if (!summary || summary.action.userId !== options.userId) {
    return null;
  }
  const failedItems = summary.items.filter((item) => item.status === "failed");
  if (failedItems.length === 0) {
    return null;
  }

  switch (summary.action.type) {
    case "ADD": {
      if (!summary.action.targetPlaylistId) {
        return null;
      }
      const videoIds = failedItems
        .map((item) => item.videoId)
        .filter((value): value is string => Boolean(value));
      if (videoIds.length === 0) {
        return null;
      }
      const payload: BulkAddPayload = {
        targetPlaylistId: summary.action.targetPlaylistId,
        videoIds,
        idempotencyKey: undefined,
      };
      return performBulkAdd(payload, {
        userId: options.userId,
        parentActionId: actionId,
      });
    }
    case "REMOVE": {
      const playlistItemIds = failedItems
        .map((item) => item.sourcePlaylistItemId)
        .filter((value): value is string => Boolean(value));
      if (playlistItemIds.length === 0) {
        return null;
      }
      const payload: BulkRemovePayload = {
        playlistItemIds,
        idempotencyKey: undefined,
      };
      return performBulkRemove(payload, {
        userId: options.userId,
        parentActionId: actionId,
      });
    }
    case "MOVE": {
      if (!summary.action.sourcePlaylistId || !summary.action.targetPlaylistId) {
        return null;
      }
      const items = failedItems
        .map((item) => {
          if (!item.sourcePlaylistItemId || !item.videoId) {
            return null;
          }
          return {
            playlistItemId: item.sourcePlaylistItemId,
            videoId: item.videoId,
          };
        })
        .filter((value): value is { playlistItemId: string; videoId: string } => Boolean(value));
      if (items.length === 0) {
        return null;
      }
      const payload: BulkMovePayload = {
        sourcePlaylistId: summary.action.sourcePlaylistId,
        targetPlaylistId: summary.action.targetPlaylistId,
        items,
        idempotencyKey: undefined,
      };
      return performBulkMove(payload, {
        userId: options.userId,
        parentActionId: actionId,
      });
    }
    default:
      return null;
  }
}