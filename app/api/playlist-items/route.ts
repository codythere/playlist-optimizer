import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/result";
import { fetchPlaylistItems } from "@/lib/youtube-service";

const DEFAULT_USER_ID = "default-user";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const playlistId = url.searchParams.get("playlistId");
  if (!playlistId) {
    return jsonError("invalid_request", "playlistId query parameter is required", {
      status: 400,
    });
  }
  const session = getSession();
  const userId = session?.userId ?? DEFAULT_USER_ID;
  const data = await fetchPlaylistItems(playlistId, userId);
  return jsonOk(data);
}