// app/api/playlist-items/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getYouTubeClient } from "@/lib/google";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const playlistId = url.searchParams.get("playlistId");
  const pageToken = url.searchParams.get("pageToken") ?? undefined;

  if (!playlistId) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "invalid_request", message: "Missing playlistId" },
      },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("ytpm_session")?.value;
  const userId = raw ? (JSON.parse(raw).userId as string) : null;

  if (!userId) {
    return NextResponse.json({
      items: [],
      nextPageToken: null,
      usingMock: true,
    });
  }

  const yt = await getYouTubeClient(userId);
  if (!yt) {
    return NextResponse.json({
      items: [],
      nextPageToken: null,
      usingMock: true,
    });
  }

  const res = await yt.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId,
    maxResults: 50,
    pageToken,
  });

  // 對齊你在 HomeClient 內的映射需求
  const items = (res.data.items ?? []).map((it) => ({
    id: it.id!, // playlistItemId
    videoId: it.contentDetails?.videoId ?? "",
    title: it.snippet?.title ?? "",
    position:
      typeof it.snippet?.position === "number" ? it.snippet!.position! : null,
    channelTitle:
      it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? "",
    thumbnails: it.snippet?.thumbnails ?? null, // {default, medium, high}
    publishedAt:
      it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? null,
  }));

  return NextResponse.json({
    items,
    nextPageToken: res.data.nextPageToken ?? null,
    usingMock: false,
  });
}
