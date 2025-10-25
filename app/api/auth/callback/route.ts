import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getEmailFromTokens,
  saveUserTokens,
} from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.json(
      { ok: false, error: "oauth_error", message: oauthError },
      { status: 400 }
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "invalid_request", message: 'Missing "code"' },
      { status: 400 }
    );
  }

  try {
    // 1) 交換 tokens
    const tokens = await exchangeCodeForTokens(code);

    // 2) 取 email 當 userId（你也可以選用 sub/或自己生成）
    const email = await getEmailFromTokens(tokens);
    const userId = email ?? "default-user";

    // 3) 存 tokens
    await saveUserTokens(userId, tokens);

    // 4) 設 session cookie（用 email 當 userId）
    const res = NextResponse.redirect(new URL("/", req.url), { status: 302 });
    res.cookies.set("ytpm_session", JSON.stringify({ userId }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "google_api_error",
        message: err?.message ?? "OAuth callback failed",
      },
      { status: 502 }
    );
  }
}
