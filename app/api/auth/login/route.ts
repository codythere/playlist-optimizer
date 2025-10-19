import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { buildAuthUrl, isGoogleConfigured } from "@/lib/google";
import { jsonOk, jsonError } from "@/lib/result";

const STATE_COOKIE = "ytpm_oauth_state";

export async function GET() {
  if (!isGoogleConfigured()) {
    return jsonOk({ loginUrl: null, usingMock: true });
  }

  const state = nanoid(18);
  const authUrl = buildAuthUrl(state);
  if (!authUrl) {
    return jsonError("oauth_not_configured", "Google OAuth is not configured", {
      status: 500,
    });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth/callback",
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}