import { NextRequest, NextResponse } from "next/server";
import { getUserTokens } from "@/lib/google";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  // 1) 從 cookie 讀 userId（你在 callback 有設 ytpm_session）
  const raw = req.cookies.get("ytpm_session")?.value;
  let userIdFromCookie: string | null = null;
  try {
    userIdFromCookie = raw ? JSON.parse(raw)?.userId ?? null : null;
  } catch {}

  // 2) 如果 cookie 沒有，就列出 DB 目前所有 user_id（避免 userId 判斷錯誤）
  const rows = db.prepare(`SELECT user_id FROM user_tokens`).all() as {
    user_id: string;
  }[];

  let result: any = {
    found: false,
    userIdTried: userIdFromCookie,
    allUserIds: rows.map((r) => r.user_id),
  };

  // 3) 如果拿得到 userId，就用它去查
  if (userIdFromCookie) {
    const tokens = await getUserTokens(userIdFromCookie);
    if (tokens) {
      result = {
        found: true,
        user_id: tokens.user_id,
        has_access_token: !!tokens.access_token,
        has_refresh_token: !!tokens.refresh_token,
        scope: tokens.scope,
        expiry_date: tokens.expiry_date,
        updated_at: tokens.updated_at,
        allUserIds: rows.map((r) => r.user_id),
      };
    }
  }

  return NextResponse.json(result);
}
