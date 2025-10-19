import { z } from "zod";

const ID_REGEX = /^[a-zA-Z0-9_-]{3,255}$/;

export const youtubeId = z
  .string()
  .min(3)
  .max(255)
  .regex(ID_REGEX, "Invalid identifier");

export const idempotencyKey = z
  .string()
  .min(8)
  .max(255);

export type YoutubeId = z.infer<typeof youtubeId>;