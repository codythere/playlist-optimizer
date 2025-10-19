import { z } from "zod";
import { idempotencyKey, youtubeId } from "./id";

export const bulkAddSchema = z.object({
  targetPlaylistId: youtubeId,
  videoIds: z.array(youtubeId).min(1, "Provide at least one video ID"),
  idempotencyKey: idempotencyKey.optional(),
});

export const bulkRemoveSchema = z.object({
  playlistItemIds: z.array(youtubeId).min(1, "Provide at least one playlist item ID"),
  sourcePlaylistId: youtubeId.optional(),
  idempotencyKey: idempotencyKey.optional(),
});

export const bulkMoveSchema = z
  .object({
    sourcePlaylistId: youtubeId,
    targetPlaylistId: youtubeId,
    items: z
      .array(
        z.object({
          playlistItemId: youtubeId,
          videoId: youtubeId,
        })
      )
      .min(1, "Provide at least one playlist item to move"),
    idempotencyKey: idempotencyKey.optional(),
  })
  .refine((value) => value.sourcePlaylistId !== value.targetPlaylistId, {
    message: "Source and target playlists must differ",
    path: ["targetPlaylistId"],
  });

export type BulkAddPayload = z.infer<typeof bulkAddSchema>;
export type BulkRemovePayload = z.infer<typeof bulkRemoveSchema>;
export type BulkMovePayload = z.infer<typeof bulkMoveSchema>;