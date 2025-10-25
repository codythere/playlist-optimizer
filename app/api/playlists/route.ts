// app/api/playlists/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getYouTubeClient } from "@/lib/google";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("ytpm_session")?.value;
  const userId = raw ? (JSON.parse(raw).userId as string) : null;

  if (!userId) {
    return NextResponse.json({
      playlists: [],
      estimatedQuota: 0,
      usingMock: true,
    });
  }

  const yt = await getYouTubeClient(userId);
  if (!yt) {
    return NextResponse.json({
      playlists: [],
      estimatedQuota: 0,
      usingMock: true,
    });
  }

  const res = await yt.playlists.list({
    part: ["snippet", "contentDetails"],
    mine: true,
    maxResults: 50,
  });

  // 對應 HomeClient 的 PlaylistSummary
  const playlists = (res.data.items ?? []).map((p) => ({
    id: p.id!,
    title: p.snippet?.title ?? "",
    channelTitle: p.snippet?.channelTitle ?? "",
    itemCount: p.contentDetails?.itemCount ?? 0,
    thumbnails: p.snippet?.thumbnails ?? null,
    thumbnailUrl:
      p.snippet?.thumbnails?.medium?.url ??
      p.snippet?.thumbnails?.high?.url ??
      p.snippet?.thumbnails?.default?.url ??
      null,
    publishedAt: p.snippet?.publishedAt ?? null,
  }));

  return NextResponse.json({
    playlists,
    estimatedQuota: 1,
    usingMock: false,
  });
}
