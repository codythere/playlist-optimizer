import { NextResponse } from "next/server";
import { buildEmptySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const empty = buildEmptySessionCookie();
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: empty.value,
    httpOnly: empty.httpOnly,
    sameSite: empty.sameSite,
    path: empty.path,
    secure: empty.secure,
    maxAge: empty.maxAge,
  });
  return res;
}
