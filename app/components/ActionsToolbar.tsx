"use client";

import * as React from "react";
import { Button } from "@/app/components/ui/button";
import type { PlaylistSummary } from "@/types/youtube";

interface ActionsToolbarProps {
  selectedCount: number;
  playlists: PlaylistSummary[];
  selectedPlaylistId?: string | null;
  onAdd: () => void;
  onRemove: () => void;
  onMove: (targetPlaylistId: string) => void;
  onUndo: () => void;
  isLoading?: boolean;
  estimatedQuota?: number;
}

export function ActionsToolbar({
  selectedCount,
  playlists,
  selectedPlaylistId,
  onAdd,
  onRemove,
  onMove,
  onUndo,
  isLoading,
  estimatedQuota,
}: ActionsToolbarProps) {
  const [targetPlaylistId, setTargetPlaylistId] = React.useState<string>("");

  const moveDisabled = selectedCount === 0 || !targetPlaylistId || isLoading;
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>已選取</span>
        <span className="font-semibold text-foreground">{selectedCount}</span>
        {estimatedQuota ? (
          <span className="text-xs text-muted-foreground">
            預估配額：{estimatedQuota}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!hasSelection || isLoading} onClick={onAdd}>
          一併加入
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={!hasSelection || isLoading}
          onClick={onRemove}
        >
          一併移除
        </Button>

        <div className="flex items-center gap-2">
          <select
            aria-label="目標播放清單"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={targetPlaylistId}
            onChange={(event) => setTargetPlaylistId(event.target.value)}
          >
            <option value="">選擇目標清單</option>
            {playlists
              .filter((playlist) => playlist.id !== selectedPlaylistId)
              .map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.title}
                </option>
              ))}
          </select>

          <Button
            size="sm"
            variant="outline"
            disabled={moveDisabled}
            onClick={() => onMove(targetPlaylistId)}
          >
            一併移轉
          </Button>
        </div>

        <Button size="sm" variant="ghost" disabled={isLoading} onClick={onUndo}>
          動作回復
        </Button>
      </div>
    </div>
  );
}
