import type { youtube_v3 } from "googleapis";
import { getYouTubeClient } from "./google";
import { logger } from "./logger";
import { parseYouTubeError, GoogleApiError } from "./errors";
import type { PlaylistItemSummary, PlaylistSummary } from "@/types/youtube";

const SAMPLE_PLAYLISTS: PlaylistSummary[] = [
  {
    id: "PL_mock_1",
    title: "?????????????",
    itemCount: 12,
    thumbnailUrl: "https://images.unsplash.com/photo-1523475472560-d2df97ec485c?w=320&auto=format&fit=crop&q=80",
  },
  {
    id: "PL_mock_2",
    title: "??????????????",
    itemCount: 8,
    thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&auto=format&fit=crop&q=80",
  },
  {
    id: "PL_mock_3",
    title: "??????????",
    itemCount: 5,
    thumbnailUrl: "https://images.unsplash.com/photo-1526378722484-cc5c7100cde1?w=320&auto=format&fit=crop&q=80",
  },
];

const SAMPLE_PLAYLIST_ITEMS: Record<string, PlaylistItemSummary[]> = {
  PL_mock_1: new Array(5).fill(0).map((_, index) => ({
    playlistItemId: `PLI_mock_1_${index}`,
    videoId: `video_mock_${index}`,
    title: `?????????? ${index + 1}`,
    channelTitle: "YT DEV Channel",
    thumbnailUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=320&auto=format&fit=crop&q=80",
    position: index,
  })),
  PL_mock_2: new Array(4).fill(0).map((_, index) => ({
    playlistItemId: `PLI_mock_2_${index}`,
    videoId: `music_mock_${index}`,
    title: `Lo-fi ????? ${index + 1}`,
    channelTitle: "Lofi Girl",
    thumbnailUrl: "https://images.unsplash.com/photo-1485579149621-3123dd979885?w=320&auto=format&fit=crop&q=80",
    position: index,
  })),
  PL_mock_3: new Array(3).fill(0).map((_, index) => ({
    playlistItemId: `PLI_mock_3_${index}`,
    videoId: `meeting_mock_${index}`,
    title: `Sprint Review ${index + 1}`,
    channelTitle: "Team Weekly",
    thumbnailUrl: "https://images.unsplash.com/photo-1587614382346-4ec892f9aca3?w=320&auto=format&fit=crop&q=80",
    position: index,
  })),
};

export async function fetchPlaylists(userId: string) {
  const client = await getYouTubeClient(userId);
  if (!client) {
    return {
      playlists: SAMPLE_PLAYLISTS,
      estimatedQuota: 0,
      usingMock: true,
    };
  }

  const playlists: PlaylistSummary[] = [];
  let nextPageToken: string | undefined;
  let quota = 0;

  do {
    try {
      const response = await client.playlists.list({
        part: ["id", "snippet", "contentDetails"],
        mine: true,
        maxResults: 50,
        pageToken: nextPageToken,
      });
      quota += 1;
      const items = response.data.items ?? [];
      for (const item of items) {
        if (!item.id || !item.snippet) continue;
        playlists.push({
          id: item.id,
          title: item.snippet.title ?? "Untitled playlist",
          itemCount: Number(item.contentDetails?.itemCount ?? 0),
          thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? null,
        });
      }
      nextPageToken = response.data.nextPageToken ?? undefined;
    } catch (error) {
      const parsed = parseYouTubeError(error);
      logger.error({ err: error, errorCode: parsed.code }, "Failed to fetch playlists from YouTube API");
      throw new GoogleApiError(parsed.code, parsed.message);
    }
  } while (nextPageToken);

  return {
    playlists,
    estimatedQuota: quota,
    usingMock: false,
  };
}

export interface PlaylistItemEntry {
  id: string;
  videoId: string;
  title: string;
  position: number | null;
  channelTitle: string;
  thumbnails: youtube_v3.Schema$ThumbnailDetails | null;
  publishedAt: string | null;
}

export async function fetchPlaylistItems(userId: string, playlistId: string, pageToken?: string) {
  const client = await getYouTubeClient(userId);
  if (!client) {
    const items = (SAMPLE_PLAYLIST_ITEMS[playlistId] ?? []).map((item) => ({
      id: item.playlistItemId,
      videoId: item.videoId,
      title: item.title,
      position: item.position ?? null,
      channelTitle: item.channelTitle,
      thumbnails: item.thumbnailUrl
        ? ({ default: { url: item.thumbnailUrl } } as youtube_v3.Schema$ThumbnailDetails)
        : null,
      publishedAt: null,
    }));
    return {
      items,
      nextPageToken: undefined,
      usingMock: true,
    };
  }

  try {
    const response = await client.playlistItems.list({
      part: ["id", "snippet", "contentDetails"],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    const entries = response.data.items ?? [];
    const items = entries
      .map((entry) => {
        const snippet = entry.snippet;
        if (!entry.id || !snippet) {
          return null;
        }
        return {
          id: entry.id,
          videoId: snippet.resourceId?.videoId ?? "",
          title: snippet.title ?? "Untitled",
          position: typeof snippet.position === "number" ? snippet.position : null,
          channelTitle: snippet.videoOwnerChannelTitle ?? snippet.channelTitle ?? "",
          thumbnails: snippet.thumbnails ?? null,
          publishedAt: snippet.publishedAt ?? null,
        };
      })
      .filter((item): item is PlaylistItemEntry => Boolean(item));

    return {
      items,
      nextPageToken: response.data.nextPageToken ?? undefined,
      usingMock: false,
    };
  } catch (error) {
    const parsed = parseYouTubeError(error);
    logger.error({ err: error, errorCode: parsed.code, playlistId }, "Failed to fetch playlist items from YouTube API");
    throw new GoogleApiError(parsed.code, parsed.message);
  }
}








