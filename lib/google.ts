// lib/google.ts
import "server-only";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { Credentials } from "google-auth-library";
import { db } from "./db";
import { logger } from "./logger";

const {
  GOOGLE_CLIENT_ID = "",
  GOOGLE_CLIENT_SECRET = "",
  GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/callback",
} = process.env;

/** DB row 型別（對應 user_tokens 資料表） */
export interface StoredTokens {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: number | null;
  id_token: string | null;
  updated_at: number | null;
}

export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

function getOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/** 產生 Google OAuth 登入網址（給 /api/auth/login 使用） */
export function buildAuthUrl(state: string): string | null {
  if (!isGoogleConfigured()) return null;
  const oauth2 = getOAuthClient();
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    // 需要寫入動作就用 youtube；只讀可改 youtube.readonly
    "https://www.googleapis.com/auth/youtube",
  ];
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // 需要 refresh_token
    include_granted_scopes: true, // 盡量重用已授權 scope
    scope: scopes,
    state,
  });
}
// 若你想保留舊名稱，也可同時導出別名：
// export const getAuthUrl = buildAuthUrl;

/** 交換 code → tokens */
export async function exchangeCodeForTokens(
  code: string
): Promise<Credentials> {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/** 從 tokens 取 email（當作 userId） */
export async function getEmailFromTokens(
  tokens: Credentials
): Promise<string | null> {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials(tokens);
  const oauth = google.oauth2("v2");
  const me = await oauth.userinfo.get({ auth: oauth2 as any });
  return me.data.email ?? null;
}

/** 初始化資料表（若不存在） */
function ensureTokenTable() {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id       TEXT PRIMARY KEY,
      access_token  TEXT,
      refresh_token TEXT,
      scope         TEXT,
      token_type    TEXT,
      expiry_date   INTEGER,
      id_token      TEXT,
      updated_at    INTEGER
    )
  `
  ).run();
}

/** 儲存使用者 tokens（有則更新；refresh_token 若沒回傳則保留舊值） */
export async function saveUserTokens(
  userId: string,
  tokens: Credentials
): Promise<void> {
  ensureTokenTable();
  db.prepare(
    `
    INSERT INTO user_tokens (user_id, access_token, refresh_token, scope, token_type, expiry_date, id_token, updated_at)
    VALUES (@user_id, @access_token, @refresh_token, @scope, @token_type, @expiry_date, @id_token, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, user_tokens.refresh_token),
      scope         = excluded.scope,
      token_type    = excluded.token_type,
      expiry_date   = excluded.expiry_date,
      id_token      = excluded.id_token,
      updated_at    = excluded.updated_at
  `
  ).run({
    user_id: userId,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    expiry_date: tokens.expiry_date ?? null,
    id_token: tokens.id_token ?? null,
    updated_at: Date.now(),
  });
}

/** 讀回使用者 tokens；不存在回 null */
export async function getUserTokens(
  userId: string
): Promise<StoredTokens | null> {
  ensureTokenTable();
  const row = db
    .prepare(`SELECT * FROM user_tokens WHERE user_id = ?`)
    .get(userId) as StoredTokens | undefined;
  return row ?? null;
}

/** 建立 YouTube client；若沒有 tokens 則回 null（讓 service 落回 mock） */
export async function getYouTubeClient(userId: string) {
  try {
    const row = await getUserTokens(userId);
    if (!row || (!row.access_token && !row.refresh_token)) {
      logger.warn(
        { userId },
        "getYouTubeClient: no tokens found, falling back to mock"
      );
      return null;
    }

    const oauth2 = getOAuthClient();
    oauth2.setCredentials({
      access_token: row.access_token ?? undefined,
      refresh_token: row.refresh_token ?? undefined,
      expiry_date: row.expiry_date ?? undefined,
    });

    // （可選）偵測刷新事件，把新的 token 寫回 DB
    oauth2.on("tokens", async (t) => {
      try {
        const merged: Credentials = {
          access_token: t.access_token ?? row.access_token ?? undefined,
          refresh_token: t.refresh_token ?? row.refresh_token ?? undefined,
          scope: t.scope ?? row.scope ?? undefined,
          token_type: t.token_type ?? row.token_type ?? undefined,
          expiry_date: t.expiry_date ?? row.expiry_date ?? undefined,
          id_token: t.id_token ?? row.id_token ?? undefined,
        };
        await saveUserTokens(userId, merged);
      } catch (e) {
        logger.error({ e, userId }, "failed to persist refreshed tokens");
      }
    });

    return google.youtube({ version: "v3", auth: oauth2 });
  } catch (err: any) {
    logger.error(
      { err, userId },
      "getYouTubeClient failed; falling back to mock"
    );
    return null;
  }
}
