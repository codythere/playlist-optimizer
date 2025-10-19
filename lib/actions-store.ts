import { nanoid } from "nanoid";
import { db } from "./db";
import type {
  ActionCounts,
  ActionItemRecord,
  ActionItemStatus,
  ActionRecord,
  ActionStatus,
  ActionType,
} from "@/types/actions";

const insertActionStmt = db.prepare(
  `INSERT INTO actions (
    id,
    user_id,
    type,
    source_playlist_id,
    target_playlist_id,
    status,
    created_at,
    parent_action_id
  ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`
);

const updateActionStatusStmt = db.prepare(
  `UPDATE actions
   SET status = ?,
       finished_at = CASE WHEN ? IS NOT NULL THEN ? ELSE finished_at END
   WHERE id = ?`
);

const selectActionByIdStmt = db.prepare("SELECT * FROM actions WHERE id = ?");

const selectActionsPageStmt = db.prepare(
  `SELECT * FROM actions
   WHERE user_id = ?1
     AND (?2 IS NULL OR created_at < ?2)
   ORDER BY created_at DESC
   LIMIT ?3`
);

const insertActionItemStmt = db.prepare(
  `INSERT INTO action_items (
    id,
    action_id,
    type,
    video_id,
    source_playlist_id,
    target_playlist_id,
    source_playlist_item_id,
    target_playlist_item_id,
    position,
    status,
    error_code,
    error_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const selectActionItemByIdStmt = db.prepare("SELECT * FROM action_items WHERE id = ?");

const selectActionItemsStmt = db.prepare(
  "SELECT * FROM action_items WHERE action_id = ? ORDER BY rowid ASC"
);

const countActionItemsStmt = db.prepare(
  `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM action_items
    WHERE action_id = ?`
);

const updateActionItemStmt = db.prepare(
  `UPDATE action_items
   SET status = ?,
       error_code = ?,
       error_message = ?,
       target_playlist_item_id = ?
   WHERE id = ?`
);

function mapAction(row: any): ActionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    sourcePlaylistId: row.source_playlist_id ?? null,
    targetPlaylistId: row.target_playlist_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? null,
    parentActionId: row.parent_action_id ?? null,
  };
}

function mapActionItem(row: any): ActionItemRecord {
  return {
    id: row.id,
    actionId: row.action_id,
    type: row.type,
    videoId: row.video_id ?? null,
    sourcePlaylistId: row.source_playlist_id ?? null,
    targetPlaylistId: row.target_playlist_id ?? null,
    sourcePlaylistItemId: row.source_playlist_item_id ?? null,
    targetPlaylistItemId: row.target_playlist_item_id ?? null,
    position: row.position ?? null,
    status: row.status,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
  };
}

export function createAction(params: {
  id?: string;
  userId: string;
  type: ActionType;
  sourcePlaylistId?: string | null;
  targetPlaylistId?: string | null;
  status?: ActionStatus;
  parentActionId?: string | null;
}): ActionRecord {
  const id = params.id ?? nanoid();
  const status = params.status ?? "pending";
  insertActionStmt.run(
    id,
    params.userId,
    params.type,
    params.sourcePlaylistId ?? null,
    params.targetPlaylistId ?? null,
    status,
    params.parentActionId ?? null
  );
  const row = selectActionByIdStmt.get(id);
  return mapAction(row);
}

export function setActionStatus(id: string, status: ActionStatus, finishedAt?: string | null) {
  updateActionStatusStmt.run(status, finishedAt ?? null, finishedAt ?? null, id);
  const row = selectActionByIdStmt.get(id);
  return mapAction(row);
}

export function createActionItems(items: Array<{
  id?: string;
  actionId: string;
  type: ActionType;
  videoId?: string | null;
  sourcePlaylistId?: string | null;
  targetPlaylistId?: string | null;
  sourcePlaylistItemId?: string | null;
  targetPlaylistItemId?: string | null;
  position?: number | null;
  status?: ActionItemStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}>) {
  const created: ActionItemRecord[] = [];
  for (const item of items) {
    const id = item.id ?? nanoid();
    insertActionItemStmt.run(
      id,
      item.actionId,
      item.type,
      item.videoId ?? null,
      item.sourcePlaylistId ?? null,
      item.targetPlaylistId ?? null,
      item.sourcePlaylistItemId ?? null,
      item.targetPlaylistItemId ?? null,
      item.position ?? null,
      item.status ?? "pending",
      item.errorCode ?? null,
      item.errorMessage ?? null
    );
    const row = selectActionItemByIdStmt.get(id);
    created.push(mapActionItem(row));
  }
  return created;
}

export function updateActionItem(id: string, updates: {
  status?: ActionItemStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  targetPlaylistItemId?: string | null;
}) {
  const existing = selectActionItemByIdStmt.get(id);
  if (!existing) {
    return null;
  }
  const mergedStatus = updates.status ?? existing.status;
  const mergedErrorCode = updates.errorCode ?? existing.error_code ?? null;
  const mergedErrorMessage = updates.errorMessage ?? existing.error_message ?? null;
  const mergedTarget = updates.targetPlaylistItemId ?? existing.target_playlist_item_id ?? null;

  updateActionItemStmt.run(
    mergedStatus,
    mergedErrorCode,
    mergedErrorMessage,
    mergedTarget,
    id
  );
  const row = selectActionItemByIdStmt.get(id);
  return row ? mapActionItem(row) : null;
}

export function listActionItems(actionId: string) {
  const rows = selectActionItemsStmt.all(actionId);
  return rows.map(mapActionItem);
}

export function getActionById(id: string) {
  const row = selectActionByIdStmt.get(id);
  return row ? mapAction(row) : null;
}

export function listActions(userId: string, limit: number, cursor?: string | null) {
  let cursorTimestamp: string | null = null;
  if (cursor) {
    const cursorAction = selectActionByIdStmt.get(cursor);
    cursorTimestamp = cursorAction?.created_at ?? null;
  }
  const rows = selectActionsPageStmt.all(userId, cursorTimestamp, limit);
  return rows.map(mapAction);
}

export function getActionCounts(actionId: string): ActionCounts {
  const row = countActionItemsStmt.get(actionId) as { total: number; success: number; failed: number } | undefined;
  return {
    total: row?.total ?? 0,
    success: row?.success ?? 0,
    failed: row?.failed ?? 0,
  };
}