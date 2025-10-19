export interface PlaylistSummary {
  id: string;
  title: string;
  itemCount: number;
  thumbnailUrl: string | null;
}

export interface PlaylistItemSummary {
  playlistItemId: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  position?: number | null;
}