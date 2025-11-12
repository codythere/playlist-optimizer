import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // 1) 檢查資料庫時間
    const now = await query<{ now: string }>("SELECT NOW()");
    // 2) 檢查 actions 是否存在（可選）
    const chk = await query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_name = 'actions'
       ) AS has_actions`
    );

    return NextResponse.json({
      ok: true,
      dbNow: now.rows[0]?.now ?? null,
      hasActionsTable: Boolean((chk.rows[0] as any)?.has_actions),
      databaseUrlHost:
        process.env.DATABASE_URL?.replace(/:\/\/.*?@/, "://***@") ?? null, // 隱碼
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
