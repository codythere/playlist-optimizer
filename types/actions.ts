export type ActionType = "ADD" | "REMOVE" | "MOVE" | "UNDO";
export type ActionStatus = "pending" | "running" | "success" | "partial" | "failed";
export type ActionItemStatus = "pending" | "success" | "failed";

export interface ActionRecord {
  id: string;
  userId: string;
  type: ActionType;
  sourcePlaylistId: string | null;
  targetPlaylistId: string | null;
  status: ActionStatus;
  createdAt: string;
  finishedAt: string | null;
  parentActionId: string | null;
  estimatedQuota?: number;
}

export interface ActionItemRecord {
  id: string;
  actionId: string;
  type: ActionType;
  videoId: string | null;
  sourcePlaylistId: string | null;
  targetPlaylistId: string | null;
  sourcePlaylistItemId: string | null;
  targetPlaylistItemId: string | null;
  position: number | null;
  status: ActionItemStatus;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ActionCounts {
  total: number;
  success: number;
  failed: number;
}

export interface ActionWithCounts extends ActionRecord {
  counts: ActionCounts;
}