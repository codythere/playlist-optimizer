"use client";

import Image from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { PlaylistSummary } from "@/types/youtube";
import { Card } from "@/app/components/ui/card";

interface PlaylistListProps {
  playlists: PlaylistSummary[];
  selectedPlaylistId?: string | null;
  onSelect: (playlistId: string) => void;
  isLoading?: boolean;
}

export function PlaylistList({ playlists, selectedPlaylistId, onSelect, isLoading }: PlaylistListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading playlists</div>;
  }

  if (playlists.length === 0) {
    return <div className="text-sm text-muted-foreground">No playlists found.</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {playlists.map((playlist) => {
        const isActive = playlist.id === selectedPlaylistId;
        return (
          <button
            key={playlist.id}
            type="button"
            onClick={() => onSelect(playlist.id)}
            className={cn(
              "text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <Card
              className={cn(
                "flex h-full flex-col overflow-hidden border transition-shadow hover:shadow-md",
                isActive && "border-primary shadow-lg"
              )}
            >
              {playlist.thumbnailUrl ? (
                <div className="relative h-36 w-full overflow-hidden">
                  <Image
                    src={playlist.thumbnailUrl}
                    alt={playlist.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 300px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                  No thumbnail
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 px-4 py-3">
                <div className="text-sm font-semibold text-foreground line-clamp-2">
                  {playlist.title}
                </div>
                <div className="text-xs text-muted-foreground">Items: {playlist.itemCount}</div>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}