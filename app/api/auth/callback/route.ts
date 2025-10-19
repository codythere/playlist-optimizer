import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildSessionCookie, buildEmptySessionCookie } from "@/lib/auth";
import { exchangeCodeForTokens, isGoogleConfigured, storeRefreshToken } from "@/lib/google";
import { logger } from "@/lib/logger";

const STATE_COOKIE = "ytpm_oauth_state";
const DEFAULT_USER_ID = "default-user";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectUrl = new URL("/", request.url);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set({
    name: STATE_COOKIE,
    value: "",
    maxAge: 0,
    path: "/api/auth/callback",
  });

  if (errorParam) {
    logger.error({ error: errorParam }, "Google OAuth returned an error");
    response.cookies.set(buildEmptySessionCookie());
    return response;
  }

  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  if (storedState && storedState !== state) {
    logger.warn({ state, storedState }, "OAuth state mismatch");
    response.cookies.set(buildEmptySessionCookie());
    return response;
  }

  if (!isGoogleConfigured()) {
    // Local development fallback: set mock session
    response.cookies.set(buildSessionCookie({ userId: DEFAULT_USER_ID }));
    return response;
  }

  if (!code) {
    logger.warn("Missing authorization code in callback");
    response.cookies.set(buildEmptySessionCookie());
    return response;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const refreshToken = tokens?.refresh_token;
    if (refreshToken) {
      storeRefreshToken(refreshToken, DEFAULT_USER_ID);
    }
    response.cookies.set(buildSessionCookie({ userId: DEFAULT_USER_ID }));
  } catch (error) {
    logger.error({ err: error }, "Failed to exchange OAuth code");
    response.cookies.set(buildEmptySessionCookie());
  }

  return response;
}