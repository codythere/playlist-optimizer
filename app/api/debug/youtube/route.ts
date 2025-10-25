import { NextResponse } from "next/server";
import { getYouTubeClient } from "@/lib/google";
import { cookies } from "next/headers";

export async function GET() {
  // 從你在 callback 設的 cookie 取 userId
  const raw = cookies().get("ytpm_session")?.value;
  const userId = raw ? (JSON.parse(raw).userId as string) : null;
  if (!userId) return NextResponse.json({ ok: false, reason: "no_user" });

  const yt = await getYouTubeClient(userId);
  if (!yt) return NextResponse.json({ ok: false, reason: "no_youtube_client" });

  // 驗證：拿 1 筆 playlist
  const res = await yt.playlists.list({
    part: ["snippet"],
    mine: true,
    maxResults: 1,
  });
  const item = res.data.items?.[0] ?? null;

  return NextResponse.json({
    ok: true,
    sample: item
      ? {
          id: item.id,
          title: item.snippet?.title,
          channelTitle: item.snippet?.channelTitle,
        }
      : null,
  });
}
