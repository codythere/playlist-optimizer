import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getUserTokens } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string | null = null;

  // 1) 先試 getSession（若你有）
  try {
    const s = await Promise.resolve(getSession?.());
    if (s?.userId) userId = s.userId;
  } catch {}

  // 2) 再從 cookie 讀（⬅️ 這裡也要 await cookies()）
  if (!userId) {
    const cookieStore = await cookies();
    const raw = cookieStore.get("ytpm_session")?.value;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) userId = parsed.userId as string;
      } catch {}
    }
  }

  const tokens = userId ? await getUserTokens(userId) : null;

  return NextResponse.json(
    {
      loggedIn: !!userId,
      userId: userId ?? undefined,
      authenticated: !!userId,
      email: userId ?? undefined,
      usingMock: !tokens,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
