"use client";

import * as React from "react";
import Image from "next/image";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { PlaylistSummary, PlaylistItemSummary } from "@/types/youtube";
import type { OperationResult } from "@/lib/actions-service";
import { cn } from "@/lib/utils";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { ActionsToolbar } from "@/app/components/ActionsToolbar";
import { PlaylistList } from "@/app/components/PlaylistList";
// import { TopBar } from "@/app/components/TopBar"; // 如有使用就打開

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
    ) as Error & {
      code?: string;
      status?: number;
    };
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

function usePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: () => apiRequest<PlaylistsPayload>("/api/playlists"),
    enabled,
    staleTime: 15_000,
  });
}

/* =========================
 * UI 子元件：欄（PlaylistColumn）
 * ========================= */
function PlaylistColumn(props: {
  playlist: PlaylistSummary;
  items: PlaylistItemSummary[];
  selectedItemIds: Set<string>;
  onToggleItem: (item: PlaylistItemSummary, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const { playlist, items, selectedItemIds, onToggleItem, onToggleAll } = props;

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

      {/* 影片清單 */}
      <div className="flex flex-col gap-2 p-3">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground px-1 py-6 text-center">
            此播放清單暫無影片
          </div>
        ) : (
          items.map((item) => {
            const checked = selectedItemIds.has(item.playlistItemId);
            return (
              <label
                key={item.playlistItemId}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border bg-background p-2 transition",
                  checked && "border-primary ring-2 ring-primary/30"
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onToggleItem(item, Boolean(c))}
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
                  <div className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.channelTitle}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

/* =========================
 * 主元件：HomeClient
 * ========================= */
export default function HomeClient() {
  const queryClient = useQueryClient();

  /* ---- Auth ---- */
  const authQ = useQuery({
    queryKey: ["auth"],
    queryFn: fetchAuth,
    staleTime: 30_000,
  });
  const auth = authQ.data;

  /* ---- 取得播放清單（頂層固定呼叫，用 enabled 控制） ---- */
  const playlistsQ = usePlaylists(
    Boolean(auth && (auth.authenticated || auth.usingMock))
  );
  const allPlaylists = React.useMemo(
    () => playlistsQ.data?.playlists ?? [],
    [playlistsQ.data?.playlists]
  );

  /* ---- 視圖狀態：先選清單 → 再管理影片 ---- */
  const [view, setView] = React.useState<View>("select-playlists");

  /* ---- 稿件 1：多選播放清單 ---- */
  const [checkedPlaylistIds, setCheckedPlaylistIds] = React.useState<
    Set<string>
  >(new Set());

  // 當清單載入後，如果還沒選，預設先勾兩個（符合稿件示意）
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

  /* ---- 稿件 2：跨欄位選取影片（每個 playlist 一組 Set） ---- */
  const [selectedMap, setSelectedMap] = React.useState<
    Record<string, Set<string>>
  >({});

  const confirmedPlaylists = React.useMemo(
    () => allPlaylists.filter((p) => checkedPlaylistIds.has(p.id)),
    [allPlaylists, checkedPlaylistIds]
  );

  /* ---- 依「被選清單」載入每欄影片（用子查詢避免 Hook 順序問題） ---- */
  const columnsData = useQueries({
    queries: confirmedPlaylists.map((p) => ({
      queryKey: ["playlist-items", p.id],
      queryFn: async () => {
        const data = await apiRequest<PlaylistItemsPayload>(
          `/api/playlist-items?playlistId=${encodeURIComponent(p.id)}`
        );
        // 映射到 UI 用的 Summary
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
      staleTime: 10_000,
    })),
  });

  /* ---- 動作列：總選取數與配額估算（對齊稿件的顯示） ---- */
  const totalSelectedCount = React.useMemo(
    () =>
      Object.values(selectedMap).reduce((sum, s) => sum + (s?.size ?? 0), 0),
    [selectedMap]
  );
  const estimatedQuota = totalSelectedCount * 50; // 估算方式可調整

  /* ---- Mutations（沿用你原本的 API） ---- */
  const addMutation = useMutation({
    mutationFn: (payload: { targetPlaylistId: string; videoIds: string[] }) =>
      apiRequest<OperationResult>("/api/bulk/add", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      // 重新拉清單/欄位
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      confirmedPlaylists.forEach((p) =>
        queryClient.invalidateQueries({ queryKey: ["playlist-items", p.id] })
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (payload: {
      playlistItemIds: string[];
      sourcePlaylistId: string;
    }) =>
      apiRequest<OperationResult>("/api/bulk/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, variables) => {
      // 清掉已選、重抓來源與清單
      setSelectedMap((prev) => ({
        ...prev,
        [variables.sourcePlaylistId]: new Set(),
      }));
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: (payload: {
      sourcePlaylistId: string;
      targetPlaylistId: string;
      items: Array<{ playlistItemId: string; videoId: string }>;
    }) =>
      apiRequest<OperationResult>("/api/bulk/move", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, variables) => {
      // 清掉來源的選取並刷新兩側
      setSelectedMap((prev) => ({
        ...prev,
        [variables.sourcePlaylistId]: new Set(),
      }));
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.targetPlaylistId],
      });
    },
  });

  /* ---- 跨欄位：把目前被勾選的影片彙整 ---- */
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

  /* ---- 動作列 Callback（零參數，符合 ActionsToolbarProps） ---- */
  const handleAddSelected = () => {
    const { allVideoIds } = getSelectedFromAllColumns();
    if (allVideoIds.length === 0) return;

    // 以 prompt 方式暫時取得目標清單（不動 Toolbar 型別）
    const hint =
      "輸入目標播放清單 ID（或精準標題）。\n可用的清單：\n" +
      allPlaylists.map((p) => `• ${p.title} (${p.id})`).join("\n");
    const input = window.prompt(hint) || "";
    const to =
      allPlaylists.find((p) => p.id === input || p.title === input)?.id ?? "";
    if (!to) return;

    addMutation.mutate({ targetPlaylistId: to, videoIds: allVideoIds });
  };

  const handleRemoveSelected = () => {
    // 將每欄的已選匯總，分欄呼叫 /bulk/remove
    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const ids = Array.from(set);
      if (ids.length > 0) {
        removeMutation.mutate({ playlistItemIds: ids, sourcePlaylistId });
      }
    });
  };

  const handleMoveSelected = () => {
    const hint =
      "輸入目標播放清單 ID（或精準標題）。\n可用的清單：\n" +
      allPlaylists.map((p) => `• ${p.title} (${p.id})`).join("\n");
    const input = window.prompt(hint) || "";
    const to =
      allPlaylists.find((p) => p.id === input || p.title === input)?.id ?? "";
    if (!to) return;

    // 將每欄的已選逐欄搬移到 to
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
        });
      }
    });
  };

  const onUndo = () => {
    // 這裡保留鉤子，若你有動作回復 API 可在此串接
  };

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
      setView("select-playlists");
    },
  });

  /* =========================
   * Render（對齊 UI 稿件）
   * ========================= */

  // 1) Auth 狀態
  if (authQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (authQ.isError || !auth) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load authentication status. Please refresh.
      </div>
    );
  }
  if (!auth.authenticated && !auth.usingMock) {
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

  // 2) 主介面（兩種視圖）
  return (
    <div className="min-h-dvh">
      {/* 如需上方列，可引入 TopBar；先留白 */}
      {/* <TopBar /> */}

      {view === "select-playlists" ? (
        /* ---------- UI 稿件 1：多選播放清單 ---------- */
        <main className="mx-auto max-w-6xl p-6 space-y-8">
          {/* 已選 Chips + 確認/取消 */}
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

          {/* 播放清單網格（可勾選） */}
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
          {/* 返回連結 */}
          <section className="flex justify-end">
            <Button variant="ghost" onClick={backToSelect}>
              ← 返回選取播放清單
            </Button>
          </section>

          {/* 上：已確認清單 Chips */}
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

          {/* 中：主要工具列（總選取數 / 估算配額） */}
          <section>
            <ActionsToolbar
              selectedCount={totalSelectedCount}
              playlists={allPlaylists}
              selectedPlaylistId={null} // 仍由 Toolbar 內部管理目標，這裡不控制
              onAdd={handleAddSelected} // ← 改為 () => void
              onRemove={handleRemoveSelected}
              onMove={handleMoveSelected} // ← 改為 () => void
              onUndo={onUndo}
              isLoading={
                addMutation.isPending ||
                removeMutation.isPending ||
                moveMutation.isPending
              }
              estimatedQuota={estimatedQuota}
            />
          </section>

          {/* 下：水平捲動的欄位 */}
          <section className="space-y-3">
            <div className="flex justify-between">
              <div className="text-xl font-semibold">播放清單</div>
              <Button variant="ghost" onClick={clearAllSelections}>
                取消勾選
              </Button>
            </div>

            <div className="relative">
              <div className="overflow-x-auto pb-2">
                <div className="flex w-max gap-4">
                  {columnsData.map((q, idx) => {
                    const pid = confirmedPlaylists[idx]?.id;
                    const playlist = confirmedPlaylists[idx];

                    if (!playlist) return null;

                    // 載入/錯誤狀態
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
                      <PlaylistColumn
                        key={playlist.id}
                        playlist={playlist}
                        items={items}
                        selectedItemIds={selectedSet}
                        onToggleItem={(item, checked) => {
                          setSelectedMap((prev) => {
                            const cur = new Set(prev[playlist.id] ?? []);
                            if (checked) cur.add(item.playlistItemId);
                            else cur.delete(item.playlistItemId);
                            return { ...prev, [playlist.id]: cur };
                          });
                        }}
                        onToggleAll={(checked) => {
                          setSelectedMap((prev) => {
                            const allIds = items.map((i) => i.playlistItemId);
                            const cur = checked
                              ? new Set(allIds)
                              : new Set<string>();
                            return { ...prev, [playlist.id]: cur };
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
    </div>
  );
}
