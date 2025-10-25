// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json(
    { ok: true, data: { success: true } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// 可選：也支援 GET（如果你有按鈕導頁的需求）
export async function GET() {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/", "http://localhost:3000"), {
    status: 302,
  });
}
