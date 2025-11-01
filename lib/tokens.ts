// /lib/tokens.ts
import { db } from "@/lib/db";

/**
 * tokens 資料表結構（若不存在會自動建立）
 * CREATE TABLE IF NOT EXISTS tokens (
 *   user_id TEXT PRIMARY KEY,
 *   access_token TEXT,
 *   refresh_token TEXT,
 *   expiry_date INTEGER
 * );
 */

export type TokenRecord = {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null; // epoch ms
};

function ensureTokensTable() {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER
    )
  `
  ).run();
}

/** 讀取使用者的 access/refresh token（沒有就回 null） */
export async function getTokensByUserId(userId: string): Promise<{
  access_token?: string | null;
  refresh_token?: string | null;
} | null> {
  ensureTokensTable();
  const row = db
    .prepare("SELECT access_token, refresh_token FROM tokens WHERE user_id = ?")
    .get(userId) as
    | { access_token?: string | null; refresh_token?: string | null }
    | undefined;

  if (!row) return null;
  return {
    access_token: row.access_token ?? null,
    refresh_token: row.refresh_token ?? null,
  };
}

/** 刪除使用者的 token（登出/撤銷後同步清 DB） */
export async function deleteTokensByUserId(userId: string) {
  ensureTokensTable();
  db.prepare("DELETE FROM tokens WHERE user_id = ?").run(userId);
}

/**
 * ✅ OAuth callback 寫入/更新用（UPSERT）
 * - 任一欄位可傳 null（不會覆蓋為 undefined）
 * - expiryDate: 以 epoch milliseconds 存進去（可選）
 */
export async function saveTokensByUserId(params: {
  userId: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  ensureTokensTable();

  const {
    userId,
    access_token = null,
    refresh_token = null,
    expiry_date = null,
  } = params;

  // better-sqlite3 支援 UPSERT 語法
  db.prepare(
    `
    INSERT INTO tokens (user_id, access_token, refresh_token, expiry_date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expiry_date  = excluded.expiry_date
  `
  ).run(userId, access_token, refresh_token, expiry_date);
}

/** （可選）讀取完整 token 紀錄 */
export async function getTokenRecord(
  userId: string
): Promise<TokenRecord | null> {
  ensureTokensTable();
  const row = db
    .prepare(
      "SELECT user_id, access_token, refresh_token, expiry_date FROM tokens WHERE user_id = ?"
    )
    .get(userId) as TokenRecord | undefined;
  return row ?? null;
}
