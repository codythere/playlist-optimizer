import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionById, listActionItemsPageSafe } from "@/lib/actions-store";
import { getYouTubeClientEx } from "@/lib/google";

type RouteContext = { params: Promise<{ id: string }> };

type EnrichedMeta = {
  videoTitle: string | null;
  sourcePlaylistName: string | null;
  targetPlaylistName: string | null;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireUserId(request);
    if (!auth) {
      return jsonError("unauthorized", "Sign in to continue", { status: 401 });
    }
    const { userId } = auth;

    const { id: actionId } = await context.params;

    const action = await getActionById(actionId); // ⬅️ 必須 await
    if (!action) {
      return jsonError("not_found", "Action not found", { status: 404 });
    }
    if (action.userId !== userId) {
      return jsonError("forbidden", "You do not have access to this action", {
        status: 403,
      });
    }

    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") || "20"))
    );
    const cursor = url.searchParams.get("cursor") || null;

    const page = await listActionItemsPageSafe(actionId, limit, cursor); // ⬅️ 必須 await

    const videoIds = new Set<string>();
    const playlistIds = new Set<string>();
    for (const it of page.items) {
      if (it.videoId) videoIds.add(it.videoId);
      if (it.sourcePlaylistId) playlistIds.add(it.sourcePlaylistId);
      if (it.targetPlaylistId) playlistIds.add(it.targetPlaylistId);
    }

    const { yt } = await getYouTubeClientEx({ userId, requireReal: false });

    const videoTitleMap: Record<string, string> = {};
    const playlistNameMap: Record<string, string> = {};

    if (yt) {
      const videoIdList = Array.from(videoIds);
      for (let i = 0; i < videoIdList.length; i += 50) {
        const batch = videoIdList.slice(i, i + 50);
        if (!batch.length) continue;
        const resp = await yt.videos.list({ part: ["snippet"], id: batch });
        for (const item of resp.data.items ?? []) {
          if (item.id) videoTitleMap[item.id] = item.snippet?.title ?? item.id;
        }
      }

      const plIdList = Array.from(playlistIds);
      for (let i = 0; i < plIdList.length; i += 50) {
        const batch = plIdList.slice(i, i + 50);
        if (!batch.length) continue;
        const resp = await yt.playlists.list({ part: ["snippet"], id: batch });
        for (const item of resp.data.items ?? []) {
          if (item.id)
            playlistNameMap[item.id] = item.snippet?.title ?? item.id;
        }
      }
    } else {
      for (const id of videoIds) videoTitleMap[id] = `Video ${id.slice(0, 6)}…`;
      for (const id of playlistIds)
        playlistNameMap[id] = `Playlist ${id.slice(0, 6)}…`;
    }

    const enrichedItems = page.items.map((it) => {
      const meta: EnrichedMeta = {
        videoTitle: it.videoId ? videoTitleMap[it.videoId] ?? null : null,
        sourcePlaylistName: it.sourcePlaylistId
          ? playlistNameMap[it.sourcePlaylistId] ?? null
          : null,
        targetPlaylistName: it.targetPlaylistId
          ? playlistNameMap[it.targetPlaylistId] ?? null
          : null,
      };
      return { ...it, meta };
    });

    const res = jsonOk({
      items: enrichedItems,
      nextCursor: page.nextCursor ?? null,
    });
    res.headers.set(
      "Cache-Control",
      "private, max-age=15, stale-while-revalidate=60"
    );
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/actions/:id/items] error:", err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
