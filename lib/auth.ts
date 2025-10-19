import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { logger } from "./logger";

export const SESSION_COOKIE_NAME = "ytpm_session";

export interface Session {
  userId: string;
}

type CookieStore = {
  get(name: string): { value: string } | undefined;
};

const FALLBACK_SECRET = "dev_only_change_me";
let hasWarnedAboutSecret = false;

function getSecret() {
  const secret = process.env.SESSION_SECRET ?? FALLBACK_SECRET;
  if (!process.env.SESSION_SECRET && !hasWarnedAboutSecret) {
    logger.warn("SESSION_SECRET not set; using fallback secret intended for development only");
    hasWarnedAboutSecret = true;
  }
  return secret;
}

function sign(payload: string) {
  const hmac = createHmac("sha256", getSecret());
  hmac.update(payload);
  return hmac.digest("base64url");
}

export function encodeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
  } catch (error) {
    return null;
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Session;
  } catch (error) {
    return null;
  }
}

export function getSessionFromCookies(store: CookieStore) {
  return decodeSession(store.get(SESSION_COOKIE_NAME)?.value);
}

export function getSession() {
  return getSessionFromCookies(cookies());
}

export function buildSessionCookie(session: Session) {
  return {
    name: SESSION_COOKIE_NAME,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function buildEmptySessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };
}