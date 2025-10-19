"use client";

import * as React from "react";
import Image from "next/image";
import type { PlaylistItemSummary } from "@/types/youtube";
import { Checkbox } from "@/app/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface PlaylistItemsPaneProps {
  items: PlaylistItemSummary[];
  selectedItemIds: Set<string>;
  onToggle: (item: PlaylistItemSummary, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  isLoading?: boolean;
  playlistTitle?: string;
}

export function PlaylistItemsPane({
  items,
  selectedItemIds,
  onToggle,
  onToggleAll,
  isLoading,
  playlistTitle,
}: PlaylistItemsPaneProps) {
  const allSelected =
    items.length > 0 &&
    items.every((item) => selectedItemIds.has(item.playlistItemId));

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading playlist items
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No videos in this playlist.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">
          {playlistTitle ?? "Playlist items"}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              onToggleAll(checked === true)
            }
          />
          Select all
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const isSelected = selectedItemIds.has(item.playlistItemId);
          return (
            <label
              key={item.playlistItemId}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition hover:border-primary",
                isSelected && "border-primary ring-2 ring-primary/30"
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  onToggle(item, checked === true)
                }
                className="mt-1"
              />
              <div className="flex flex-1 gap-3">
                <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.thumbnailUrl ? (
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      sizes="(max-width: 768px) 120px, 180px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-between text-sm">
                  <div className="font-medium text-foreground line-clamp-2">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.channelTitle}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
