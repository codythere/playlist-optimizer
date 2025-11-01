// /app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { deleteTokensByUserId, getTokensByUserId } from "@/lib/tokens";
import { revokeRefreshToken, revokeAccessToken } from "@/lib/google-revoke";

// ✅ 確保使用 Node.js runtime（better-sqlite3 需要）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // 1) 取目前使用者（容錯：沒有也照樣清 cookie）
    const user = await getCurrentUser();
    const userId = user?.id ?? null;

    // 2) 可選：讀 DB token（有才嘗試 revoke）
    let tokens: {
      access_token?: string | null;
      refresh_token?: string | null;
    } | null = null;
    if (userId) {
      try {
        tokens = await getTokensByUserId(userId);
      } catch (e) {
        // 不阻塞登出，但記 log 診斷
        console.error("[logout] getTokensByUserId failed:", e);
      }
    }

    // 3) Revoke（不阻塞：任何錯誤都吞掉）
    try {
      if (tokens?.refresh_token) {
        await revokeRefreshToken(tokens.refresh_token);
      }
      if (tokens?.access_token) {
        await revokeAccessToken(tokens.access_token);
      }
    } catch (e) {
      console.warn("[logout] revoke token failed:", e);
    }

    // 4) 清 DB（不阻塞）
    if (userId) {
      try {
        await deleteTokensByUserId(userId);
      } catch (e) {
        console.error("[logout] deleteTokensByUserId failed:", e);
      }
    }

    // 5) 清 cookie（可一起把 OAuth 相關也清掉）
    await clearSessionCookie([
      "access_token",
      "refresh_token",
      "google_oauth_state",
      "google_oauth_verifier",
      "ytpm_uid",
    ]);

    return NextResponse.json(
      { ok: true, data: { success: true } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    // ✅ 回傳可診斷訊息（僅開發期有用；上線可拿掉 error 文本）
    console.error("[logout] fatal:", e);
    return NextResponse.json(
      { ok: false, error: "logout_failed", detail: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET() {
  // 單純清 cookie + redirect（不做 DB / revoke）
  await clearSessionCookie([
    "access_token",
    "refresh_token",
    "google_oauth_state",
    "google_oauth_verifier",
    "ytpm_uid",
  ]);
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
