import { google, type youtube_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { nanoid } from "nanoid";
import { db } from "./db";
import { logger } from "./logger";

const SCOPES = ["https://www.googleapis.com/auth/youtube"];
const DEFAULT_USER_ID = "default-user";

const insertToken = db.prepare(
  "INSERT INTO oauth_tokens (user_id, refresh_token) VALUES (?, ?)"
);
const selectToken = db.prepare(
  "SELECT refresh_token FROM oauth_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
);

export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

function getClientCredentials() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Google OAuth client is not configured; set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI"
    );
  }
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  };
}

export function createOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildAuthUrl(state?: string) {
  if (!isGoogleConfigured()) {
    return null;
  }
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: state ?? nanoid(16),
  });
}

export function storeRefreshToken(refreshToken: string, userId: string = DEFAULT_USER_ID) {
  insertToken.run(userId, refreshToken);
  return userId;
}

export function getStoredRefreshToken(userId: string = DEFAULT_USER_ID) {
  const row = selectToken.get(userId) as { refresh_token: string } | undefined;
  return row?.refresh_token ?? null;
}

export async function exchangeCodeForTokens(code: string) {
  if (!isGoogleConfigured()) {
    return null;
  }
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getAuthorizedClient(userId: string = DEFAULT_USER_ID) {
  if (!isGoogleConfigured()) {
    return null;
  }
  const refreshToken = getStoredRefreshToken(userId);
  if (!refreshToken) {
    return null;
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    await client.getAccessToken();
  } catch (error) {
    logger.error({ err: error }, "Failed to refresh Google API access token");
    return null;
  }
  return client;
}

export async function getYouTubeClient(userId: string = DEFAULT_USER_ID) {
  const auth = await getAuthorizedClient(userId);
  if (!auth) {
    return null;
  }
  return google.youtube({ version: "v3", auth });
}

export type YouTubeClient = youtube_v3.Youtube;
export type YouTubePlaylist = youtube_v3.Schema$Playlist;
export type YouTubePlaylistItem = youtube_v3.Schema$PlaylistItem;