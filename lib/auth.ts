// lib/auth.ts
import { cookies } from "next/headers";

const SESSION_COOKIE = "ytpm_session";

export type Session = { userId: string };

// 讀 cookie
export async function getSessionFromCookies(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return getSessionFromCookies();
}

// 設 cookie
export async function setSessionCookie(
  value: string,
  opts?: { expires?: Date }
) {
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...opts,
  });
}

// 清 cookie  ← 你缺少的這個
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// 要求 userId（未登入回 null）
export async function requireUserId(): Promise<string | null> {
  const s = await getSession();
  return s?.userId ?? null;
}

// 提供 /api/auth/me 用
export async function resolveAuthContext() {
  const s = await getSession();
  return s?.userId
    ? { loggedIn: true, userId: s.userId }
    : { loggedIn: false, userId: null };
}
