"use client";

import * as React from "react";
import Image from "next/image";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PlaylistSummary, PlaylistItemSummary } from "@/types/youtube";
import type { OperationResult } from "@/lib/actions-service";
import { cn } from "@/lib/utils";

import { PlaylistList } from "@/app/components/PlaylistList";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { ActionsToolbar } from "@/app/components/ActionsToolbar";
import { ProgressToast } from "@/app/components/ProgressToast";

/* =========================
 * 型別與共用工具
 * ========================= */

type View = "select-playlists" | "manage-items";

interface AuthState {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  usingMock: boolean;
}

interface PlaylistsPayload {
  playlists: PlaylistSummary[];
  estimatedQuota: number;
  usingMock: boolean;
}

interface ThumbnailMapEntry {
  url?: string;
  width?: number;
  height?: number;
}
interface ThumbnailMap {
  default?: ThumbnailMapEntry;
  medium?: ThumbnailMapEntry;
  high?: ThumbnailMapEntry;
  standard?: ThumbnailMapEntry;
  maxres?: ThumbnailMapEntry;
}

interface PlaylistItemApiEntry {
  id: string;
  videoId: string;
  title: string;
  position: number | null;
  channelTitle: string;
  thumbnails: ThumbnailMap | null;
  publishedAt: string | null;
}

interface PlaylistItemsPayload {
  items: PlaylistItemApiEntry[];
  nextPageToken?: string | null;
  usingMock: boolean;
}

function extractThumbnailUrl(th: ThumbnailMap | null) {
  return th?.medium?.url ?? th?.high?.url ?? th?.default?.url ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function extractApiError(
  payload: unknown
): { code?: string; message?: string } | null {
  if (!isRecord(payload)) return null;
  if (payload.ok === false && isRecord(payload.error)) {
    const e = payload.error as Record<string, unknown>;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  return null;
}
function extractApiData<T>(payload: unknown): T | undefined {
  if (!isRecord(payload)) return undefined;
  if (payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return undefined;
}

/* ---- 封裝 fetch ---- */
async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText || "Request failed");
  }

  const apiErr = extractApiError(payload);
  if (!res.ok || apiErr) {
    const err = new Error(
      apiErr?.message ?? res.statusText ?? "Request failed"
    ) as Error & { code?: string; status?: number };
    err.code = apiErr?.code;
    err.status = res.status;
    throw err;
  }

  const data = extractApiData<T>(payload);
  return (data !== undefined ? data : (payload as T)) as T;
}

async function fetchAuth(): Promise<AuthState> {
  return apiRequest<AuthState>("/api/auth/me");
}

// 把一批「暫時的影片資料」加到目標清單的快取（若不存在則忽略）
function addToPlaylistCache(
  queryClient: import("@tanstack/react-query").QueryClient,
  playlistId: string,
  addItems: PlaylistItemSummary[]
) {
  const key = ["playlist-items", playlistId] as const;
  const prev = queryClient.getQueryData<{
    playlist: PlaylistSummary;
    items: PlaylistItemSummary[];
  }>(key);
  if (!prev) return;
  const existingIds = new Set(prev.items.map((it) => it.videoId));
  const next = {
    ...prev,
    items: [
      ...prev.items,
      ...addItems.filter((it) => !existingIds.has(it.videoId)),
    ],
  };
  queryClient.setQueryData(key, next);
}

// 從快取移除一批「暫時插入」的項目（用 temp-<videoId> 規則）
function removeTempFromPlaylistCache(
  queryClient: import("@tanstack/react-query").QueryClient,
  playlistId: string,
  videoIds: string[]
) {
  const key = ["playlist-items", playlistId] as const;
  const prev = queryClient.getQueryData<{
    playlist: PlaylistSummary;
    items: PlaylistItemSummary[];
  }>(key);
  if (!prev) return;
  const tempSet = new Set(videoIds.map((v) => `temp-${v}`));
  const next = {
    ...prev,
    items: prev.items.filter((it) => !tempSet.has(it.playlistItemId)),
  };
  queryClient.setQueryData(key, next);
}

// 把某個 playlist 的快取 items 過濾掉指定 playlistItemIds
function removeFromPlaylistCache(
  queryClient: import("@tanstack/react-query").QueryClient,
  playlistId: string,
  removeIds: string[]
) {
  const key = ["playlist-items", playlistId] as const;
  const prev = queryClient.getQueryData<{
    playlist: PlaylistSummary;
    items: PlaylistItemSummary[];
  }>(key);
  if (!prev) return;
  const removeSet = new Set(removeIds);
  const next = {
    ...prev,
    items: prev.items.filter((it) => !removeSet.has(it.playlistItemId)),
  };
  queryClient.setQueryData(key, next);
}

function usePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: () => apiRequest<PlaylistsPayload>("/api/playlists"),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/* =========================
 * UI 子元件
 * ========================= */

/** ✅ 單一影片列：只有 checked 或 item.id 改變時才重渲染 */
const ItemRow = React.memo(
  function ItemRow(props: {
    item: PlaylistItemSummary;
    checked: boolean;
    onToggle: (item: PlaylistItemSummary, checked: boolean) => void;
  }) {
    const { item, checked, onToggle } = props;
    return (
      <label
        className={cn(
          "flex cursor-pointer gap-3 rounded-md border bg-background p-2 transition",
          checked && "border-primary ring-2 ring-primary/30"
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(c) => onToggle(item, Boolean(c))}
          className="mt-1"
        />
        <div className="relative h-14 w-24 overflow-hidden rounded bg-muted flex-shrink-0">
          {item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt={item.title}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            {item.channelTitle}
          </div>
        </div>
      </label>
    );
  },
  (prev, next) => {
    return (
      prev.checked === next.checked &&
      prev.item.playlistItemId === next.item.playlistItemId
    );
  }
);

/** 欄（PlaylistColumn）：虛擬滾動（用實測高度） */
function PlaylistColumn(props: {
  playlist: PlaylistSummary;
  items: PlaylistItemSummary[];
  selectedItemIds: Set<string>;
  onToggleItem: (item: PlaylistItemSummary, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const { playlist, items, selectedItemIds, onToggleItem, onToggleAll } = props;

  const scrollParentRef = React.useRef<HTMLDivElement>(null);

  const ROW_HEIGHT = 72;
  const ROW_GAP = 8;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const allSelected =
    items.length > 0 &&
    items.every((x) => selectedItemIds.has(x.playlistItemId));

  return (
    <div className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm">
      {/* 欄頭 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold">{playlist.title}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onToggleAll(Boolean(c))}
          />
          全選
        </label>
      </div>

      {/* 影片清單（虛擬化容器） */}
      <div
        ref={scrollParentRef}
        className="overflow-auto px-3 py-3"
        style={{ height: 520 }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index];
            const checked = selectedItemIds.has(item.playlistItemId);
            const isLast = vi.index === items.length - 1;

            return (
              <div
                key={item.playlistItemId}
                ref={rowVirtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  paddingBottom: isLast ? 0 : ROW_GAP,
                }}
              >
                <ItemRow
                  item={item}
                  checked={checked}
                  onToggle={onToggleItem}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 欄級別也 memo；只要 selected Set 引用/ items 引用不變，就不重繪整欄 */
const MemoPlaylistColumn = React.memo(PlaylistColumn, (prev, next) => {
  const samePlaylist = prev.playlist.id === next.playlist.id;
  const sameSelectedSetRef = prev.selectedItemIds === next.selectedItemIds;
  const sameItemsRef = prev.items === next.items;
  return samePlaylist && sameSelectedSetRef && sameItemsRef;
});

/* =========================
 * 主元件：HomeClient
 * ========================= */
export default function HomeClient() {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = React.useTransition();

  /* ---- Auth ---- */
  const authQ = useQuery({
    queryKey: ["auth"],
    queryFn: fetchAuth,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true, // ✅ 重新聚焦就重抓
  });
  const auth = authQ.data;

  /* ---- 取得播放清單 ---- */
  const playlistsQ = usePlaylists(
    Boolean(auth && (auth.authenticated || auth.usingMock))
  );
  const allPlaylists = React.useMemo(
    () => playlistsQ.data?.playlists ?? [],
    [playlistsQ.data?.playlists]
  );

  /* ---- 視圖狀態 ---- */
  const [view, setView] = React.useState<View>("select-playlists");

  // ✅ 共用 ProgressToast 狀態
  const [actionToast, setActionToast] = React.useState<{
    status: "idle" | "loading" | "success" | "error";
    label: string;
  }>({ status: "idle", label: "" });

  /* ---- 稿件 1：多選播放清單 ---- */
  const [checkedPlaylistIds, setCheckedPlaylistIds] = React.useState<
    Set<string>
  >(new Set());

  React.useEffect(() => {
    if (allPlaylists.length > 0 && checkedPlaylistIds.size === 0) {
      setCheckedPlaylistIds(new Set(allPlaylists.slice(0, 2).map((p) => p.id)));
    }
  }, [allPlaylists]); // eslint-disable-line

  const toggleSelectPlaylist = (pid: string, checked: boolean) => {
    setCheckedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(pid);
      else next.delete(pid);
      return next;
    });
  };
  const onCancelSelect = () => setCheckedPlaylistIds(new Set());
  const onConfirmSelect = () => {
    if (checkedPlaylistIds.size === 0) return;
    setView("manage-items");
  };

  /* ---- 稿件 2：跨欄位選取影片 ---- */
  const [selectedMap, setSelectedMap] = React.useState<
    Record<string, Set<string>>
  >({});

  const confirmedPlaylists = React.useMemo(
    () => allPlaylists.filter((p) => checkedPlaylistIds.has(p.id)),
    [allPlaylists, checkedPlaylistIds]
  );

  /* ---- 依「被選清單」載入每欄影片 ---- */
  const columnsData = useQueries({
    queries: confirmedPlaylists.map((p) => ({
      queryKey: ["playlist-items", p.id],
      queryFn: async () => {
        const data = await apiRequest<PlaylistItemsPayload>(
          `/api/playlist-items?playlistId=${encodeURIComponent(p.id)}`
        );
        const items: PlaylistItemSummary[] = (data.items ?? []).map((it) => ({
          playlistItemId: it.id,
          videoId: it.videoId,
          title: it.title,
          channelTitle: it.channelTitle,
          thumbnailUrl: extractThumbnailUrl(it.thumbnails),
          position: it.position ?? null,
        }));
        return { playlist: p, items };
      },
      enabled: view === "manage-items",
      staleTime: 0,
      refetchOnMount: "always",
    })),
  });

  /* ---- 動作列數據 ---- */
  const totalSelectedCount = React.useMemo(
    () =>
      Object.values(selectedMap).reduce((sum, s) => sum + (s?.size ?? 0), 0),
    [selectedMap]
  );
  const estimatedQuota = totalSelectedCount * 50;

  /* ---- 目標清單（由工具列 DDL 選擇） ---- */
  const [targetPlaylistId, setTargetPlaylistId] = React.useState<string | null>(
    null
  );

  /* ---- Mutations ---- */
  function makeIdemKey(prefix = "op") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const addMutation = useMutation({
    mutationFn: (payload: {
      targetPlaylistId: string;
      videoIds: string[];
      idempotencyKey?: string;
    }) =>
      apiRequest<OperationResult>("/api/bulk/add", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    // ⭐ 樂觀更新
    onMutate: async (variables) => {
      const { targetPlaylistId, videoIds } = variables;

      setActionToast({ status: "loading", label: "新增到播放清單" });

      await queryClient.cancelQueries({
        queryKey: ["playlist-items", targetPlaylistId],
      });

      // 蒐集 meta → 樂觀插入
      const metaByVideoId = new Map<string, PlaylistItemSummary>();
      columnsData.forEach((q) => {
        const data = q.data;
        if (!data) return;
        data.items.forEach((it) => {
          if (selectedMap[data.playlist.id]?.has(it.playlistItemId)) {
            metaByVideoId.set(it.videoId, {
              playlistItemId: `temp-${it.videoId}`,
              videoId: it.videoId,
              title: it.title,
              channelTitle: it.channelTitle,
              thumbnailUrl: it.thumbnailUrl ?? null,
              position: null,
            });
          }
        });
      });

      const optimisticItems: PlaylistItemSummary[] = videoIds.map((vid) => {
        const meta = metaByVideoId.get(vid);
        return {
          playlistItemId: `temp-${vid}`,
          videoId: vid,
          title: meta?.title ?? "（待載入）",
          channelTitle: meta?.channelTitle ?? "",
          thumbnailUrl: meta?.thumbnailUrl ?? null,
          position: null,
        };
      });

      addToPlaylistCache(queryClient, targetPlaylistId, optimisticItems);

      const key = ["playlist-items", targetPlaylistId] as const;
      const hadCache = Boolean(queryClient.getQueryData(key));
      return { targetPlaylistId, videoIds, hadCache };
    },

    onError: (_error, _vars, ctx) => {
      setActionToast({ status: "error", label: "新增到播放清單" });
      if (ctx?.hadCache) {
        removeTempFromPlaylistCache(
          queryClient,
          ctx.targetPlaylistId,
          ctx.videoIds
        );
      }
    },

    onSuccess: () => {
      setActionToast({ status: "success", label: "新增到播放清單" });
    },

    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.targetPlaylistId],
      });
      await new Promise((r) => setTimeout(r, 200));
      await queryClient.refetchQueries({
        queryKey: ["playlist-items", variables.targetPlaylistId],
      });
      setTimeout(() => setActionToast((s) => ({ ...s, status: "idle" })), 0);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (payload: {
      playlistItemIds: string[];
      sourcePlaylistId: string;
      idempotencyKey?: string;
    }) =>
      apiRequest<OperationResult>("/api/bulk/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    // ⭐ 樂觀更新
    onMutate: async (variables) => {
      const { sourcePlaylistId, playlistItemIds } = variables;

      setActionToast({ status: "loading", label: "從清單移除" });

      await queryClient.cancelQueries({
        queryKey: ["playlist-items", sourcePlaylistId],
      });

      const key = ["playlist-items", sourcePlaylistId] as const;
      const snapshot = queryClient.getQueryData<{
        playlist: PlaylistSummary;
        items: PlaylistItemSummary[];
      }>(key);

      const backupRemoved =
        snapshot?.items.filter((i) =>
          playlistItemIds.includes(i.playlistItemId)
        ) ?? [];

      removeFromPlaylistCache(queryClient, sourcePlaylistId, playlistItemIds);

      // 清該欄的選取狀態
      setSelectedMap((prev) => ({ ...prev, [sourcePlaylistId]: new Set() }));

      return { key, snapshot, sourcePlaylistId, backupRemoved };
    },

    onError: (_err, _variables, ctx) => {
      if (ctx?.key && ctx?.snapshot) {
        queryClient.setQueryData(ctx.key, ctx.snapshot);
      }
      setActionToast({ status: "error", label: "從清單移除" });
    },

    onSuccess: () => {
      setActionToast({ status: "success", label: "從清單移除" });
    },

    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
      await new Promise((r) => setTimeout(r, 200));
      await queryClient.refetchQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
      setTimeout(() => setActionToast((s) => ({ ...s, status: "idle" })), 0);
    },
  });

  const moveMutation = useMutation({
    mutationFn: (payload: {
      sourcePlaylistId: string;
      targetPlaylistId: string;
      items: Array<{ playlistItemId: string; videoId: string }>;
      idempotencyKey?: string;
    }) =>
      apiRequest<OperationResult>("/api/bulk/move", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    // ⭐ 雙邊樂觀（來源移除 + 目標加入暫時列）
    onMutate: async ({ sourcePlaylistId, targetPlaylistId, items }) => {
      setActionToast({ status: "loading", label: "一併移轉" });

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["playlist-items", sourcePlaylistId],
        }),
        queryClient.cancelQueries({
          queryKey: ["playlist-items", targetPlaylistId],
        }),
      ]);

      const srcKey = ["playlist-items", sourcePlaylistId] as const;
      const srcPrev = queryClient.getQueryData<{
        playlist: PlaylistSummary;
        items: PlaylistItemSummary[];
      }>(srcKey);

      const movingItems =
        srcPrev?.items.filter((i) =>
          items.some((x) => x.playlistItemId === i.playlistItemId)
        ) ?? [];

      // 樂觀：來源先移除
      removeFromPlaylistCache(
        queryClient,
        sourcePlaylistId,
        items.map((it) => it.playlistItemId)
      );

      // 樂觀：目標先加入「暫時項目」
      const optimisticTargetItems: PlaylistItemSummary[] = movingItems.map(
        (i) => ({
          playlistItemId: `temp-${i.videoId}`,
          videoId: i.videoId,
          title: i.title,
          channelTitle: i.channelTitle,
          thumbnailUrl: i.thumbnailUrl ?? null,
          position: null,
        })
      );
      addToPlaylistCache(queryClient, targetPlaylistId, optimisticTargetItems);

      // 清來源欄的選取
      setSelectedMap((prev) => ({ ...prev, [sourcePlaylistId]: new Set() }));

      return {
        sourcePlaylistId,
        targetPlaylistId,
        backupSourceItems: movingItems,
        optimisticTargetVideoIds: movingItems.map((i) => i.videoId),
      };
    },

    onError: (_e, _vars, ctx) => {
      if (ctx) {
        // 回滾來源
        if (ctx.backupSourceItems?.length) {
          const key = ["playlist-items", ctx.sourcePlaylistId] as const;
          const prev = queryClient.getQueryData<{
            playlist: PlaylistSummary;
            items: PlaylistItemSummary[];
          }>(key);
          if (prev) {
            queryClient.setQueryData(key, {
              ...prev,
              items: [...prev.items, ...ctx.backupSourceItems],
            });
          }
        }
        // 移除目標暫時列
        removeTempFromPlaylistCache(
          queryClient,
          ctx.targetPlaylistId,
          ctx.optimisticTargetVideoIds
        );
      }
      setActionToast({ status: "error", label: "一併移轉" });
    },

    onSuccess: () => {
      setActionToast({ status: "success", label: "一併移轉" });
    },

    onSettled: async (_d, _e, { sourcePlaylistId, targetPlaylistId }) => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["playlist-items", sourcePlaylistId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["playlist-items", targetPlaylistId],
        }),
      ]);
      await new Promise((r) => setTimeout(r, 150));
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["playlist-items", sourcePlaylistId],
        }),
        queryClient.refetchQueries({
          queryKey: ["playlist-items", targetPlaylistId],
        }),
      ]);
      setTimeout(() => setActionToast((s) => ({ ...s, status: "idle" })), 0);
    },
  });

  /* ---- 抽取被勾選 ---- */
  function getSelectedFromAllColumns() {
    const result: {
      bySource: Record<
        string,
        { playlistItemIds: string[]; videoIds: string[] }
      >;
      allVideoIds: string[];
    } = { bySource: {}, allVideoIds: [] };

    confirmedPlaylists.forEach((p) => {
      const q = columnsData.find((cq) => cq.data?.playlist.id === p.id);
      const set = selectedMap[p.id] ?? new Set<string>();
      const items = q?.data?.items ?? [];
      const picked = items.filter((it) => set.has(it.playlistItemId));
      const playlistItemIds = picked.map((it) => it.playlistItemId);
      const videoIds = picked.map((it) => it.videoId);

      if (playlistItemIds.length) {
        result.bySource[p.id] = { playlistItemIds, videoIds };
        result.allVideoIds.push(...videoIds);
      }
    });

    return result;
  }

  /* ---- 動作列 Callback ---- */

  // 由 DDL 決定目標，不再使用 prompt
  const handleAddSelected = (targetIdFromToolbar?: string | null) => {
    const to = (targetIdFromToolbar ?? targetPlaylistId) || null;
    if (!to) {
      window.alert("請先在工具列的下拉選單選擇【目標播放清單】。");
      return;
    }

    const { allVideoIds } = getSelectedFromAllColumns();
    if (allVideoIds.length === 0) return;

    const targetName =
      allPlaylists.find((p) => p.id === to)?.title ?? `(ID: ${to})`;
    const ok = window.confirm(
      `確認要將已勾選的 ${allVideoIds.length} 部影片新增到「${targetName}」嗎？`
    );
    if (!ok) return;

    addMutation.mutate({
      targetPlaylistId: to,
      videoIds: allVideoIds,
      idempotencyKey: makeIdemKey("add"),
    });
  };

  // 一併移轉（以 DDL 決定目標）
  const handleMoveSelected = (targetIdFromToolbar?: string | null) => {
    const to = (targetIdFromToolbar ?? targetPlaylistId) || null;
    if (!to) {
      window.alert("請先在工具列的下拉選單選擇【目標播放清單】。");
      return;
    }

    const total = totalSelectedCount;
    if (total === 0) return;

    const targetName =
      allPlaylists.find((p) => p.id === to)?.title ?? `(ID: ${to})`;
    const ok = window.confirm(
      `確認要將已勾選的 ${total} 部影片「一併移轉」到「${targetName}」嗎？`
    );
    if (!ok) return;

    // 逐來源清單執行 move（可序列化送出）
    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const itemsInSource =
        columnsData
          .find((q) => q.data?.playlist.id === sourcePlaylistId)
          ?.data?.items.filter((it) => set.has(it.playlistItemId)) ?? [];
      if (itemsInSource.length > 0) {
        moveMutation.mutate({
          sourcePlaylistId,
          targetPlaylistId: to,
          items: itemsInSource.map((it) => ({
            playlistItemId: it.playlistItemId,
            videoId: it.videoId,
          })),
          idempotencyKey: makeIdemKey("move"),
        });
      }
    });
  };

  const handleRemoveSelected = () => {
    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const ids = Array.from(set);
      if (ids.length > 0) {
        removeMutation.mutate({
          playlistItemIds: ids,
          sourcePlaylistId,
          idempotencyKey: makeIdemKey("remove"),
        });
      }
    });
  };

  const onUndo = () => {};
  const backToSelect = () => setView("select-playlists");
  const clearAllSelections = () => setSelectedMap({});

  /* ---- 登入/登出 ---- */
  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };
  const logoutMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setCheckedPlaylistIds(new Set());
      setSelectedMap({});
      setTargetPlaylistId(null);
      setView("select-playlists");
    },
  });

  /* =========================
   * 兩條同步滑軌（Top/Bottom）
   * ========================= */
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bottomScrollRef = React.useRef<HTMLDivElement>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = React.useState(0);
  const syncingRef = React.useRef<"top" | "bottom" | null>(null);

  const onTopScroll = () => {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    if (syncingRef.current === "bottom") return;
    syncingRef.current = "top";
    bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    syncingRef.current = null;
  };
  const onBottomScroll = () => {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    if (syncingRef.current === "top") return;
    syncingRef.current = "bottom";
    topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    syncingRef.current = null;
  };

  const columnsKey = React.useMemo(
    () =>
      columnsData
        .map(
          (q, i) =>
            `${confirmedPlaylists[i]?.id ?? "x"}:${q.data?.items?.length ?? 0}`
        )
        .join("|"),
    [columnsData, confirmedPlaylists]
  );

  React.useLayoutEffect(() => {
    const update = () => {
      const w =
        rowRef.current?.scrollWidth ??
        bottomScrollRef.current?.scrollWidth ??
        0;
      setContentWidth(w);
    };

    update();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && rowRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(rowRef.current);
    }
    window.addEventListener("resize", update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [confirmedPlaylists.length, columnsKey]);

  /* =========================
   * Render
   * ========================= */

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (authQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (authQ.isError || !auth) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load authentication status. Please refresh.
      </div>
    );
  }
  // ✅ 只看 authenticated
  if (!auth.authenticated) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
          Sign in to manage your playlists
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect your Google account to fetch playlists and run bulk operations
          with the YouTube Data API.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleLogin}>Sign in with Google</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {view === "select-playlists" ? (
        /* ---------- UI 稿件 1：多選播放清單 ---------- */
        <main className="mx-auto max-w-6xl p-6 space-y-8">
          <section className="space-y-3">
            <div className="text-lg font-semibold">已選取播放清單：</div>
            <div className="flex flex-wrap gap-2">
              {[...checkedPlaylistIds].map((pid) => {
                const p = allPlaylists.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <span
                    key={pid}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                  >
                    {p.title}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onCancelSelect}>
                取消
              </Button>
              <Button
                onClick={onConfirmSelect}
                disabled={checkedPlaylistIds.size === 0}
              >
                確認
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xl font-semibold">播放清單</div>
            <PlaylistList
              playlists={allPlaylists}
              selectable
              selectedIds={checkedPlaylistIds}
              onToggleSelect={toggleSelectPlaylist}
              isLoading={playlistsQ.isLoading}
            />
          </section>
        </main>
      ) : (
        /* ---------- UI 稿件 2：管理多欄影片 ---------- */
        <main className="mx-auto max-w-[1200px] p-6 space-y-8">
          <section className="flex justify-end">
            <Button variant="ghost" onClick={backToSelect}>
              ← 返回選取播放清單
            </Button>
          </section>

          <section className="space-y-3">
            <div className="text-lg font-semibold">已選取播放清單：</div>
            <div className="flex flex-wrap gap-2">
              {confirmedPlaylists.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                >
                  {p.title}
                </span>
              ))}
            </div>
          </section>

          <section>
            <ActionsToolbar
              selectedCount={totalSelectedCount}
              playlists={allPlaylists}
              selectedPlaylistId={targetPlaylistId}
              onTargetChange={setTargetPlaylistId}
              onAdd={handleAddSelected}
              onRemove={handleRemoveSelected}
              onMove={(tid?: string | null) => handleMoveSelected(tid)}
              onUndo={onUndo}
              estimatedQuota={estimatedQuota}
              /* ✅ 進階版：各自 loading */
              addLoading={addMutation.isPending}
              removeLoading={removeMutation.isPending}
              moveLoading={moveMutation.isPending}
            />
          </section>

          {/* 下方內容 + 雙滑軌 */}
          <section className="space-y-3">
            <div className="flex justify-between">
              <div className="text-xl font-semibold">播放清單</div>
              <Button variant="ghost" onClick={clearAllSelections}>
                取消勾選
              </Button>
            </div>

            <div className="relative">
              <div
                ref={bottomScrollRef}
                onScroll={onBottomScroll}
                className="overflow-x-auto pb-2"
              >
                <div ref={rowRef} className="flex w-max gap-4">
                  {columnsData.map((q, idx) => {
                    const pid = confirmedPlaylists[idx]?.id;
                    const playlist = confirmedPlaylists[idx];
                    if (!playlist) return null;

                    if (q.isLoading) {
                      return (
                        <div
                          key={playlist.id}
                          className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm p-4 text-sm text-muted-foreground"
                        >
                          載入中…
                        </div>
                      );
                    }
                    if (q.isError) {
                      return (
                        <div
                          key={playlist.id}
                          className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm p-4 text-sm text-destructive"
                        >
                          讀取失敗
                        </div>
                      );
                    }

                    const items = q.data?.items ?? [];
                    const selectedSet = selectedMap[pid!] ?? new Set<string>();

                    return (
                      <MemoPlaylistColumn
                        key={playlist.id}
                        playlist={playlist}
                        items={items}
                        selectedItemIds={selectedSet}
                        onToggleItem={(item, checked) => {
                          startTransition(() => {
                            setSelectedMap((prev) => {
                              const next = { ...prev };
                              const cur = new Set(next[playlist.id] ?? []);
                              if (checked) cur.add(item.playlistItemId);
                              else cur.delete(item.playlistItemId);
                              next[playlist.id] = cur;
                              return next;
                            });
                          });
                        }}
                        onToggleAll={(checked) => {
                          startTransition(() => {
                            setSelectedMap((prev) => {
                              const next = { ...prev };
                              next[playlist.id] = checked
                                ? new Set(items.map((i) => i.playlistItemId))
                                : new Set<string>();
                              return next;
                            });
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
      {/* ✅ 共用一次 ProgressToast */}
      <ProgressToast
        status={actionToast.status}
        actionLabel={actionToast.label}
        successMessage="操作完成"
      />
    </div>
  );
}
