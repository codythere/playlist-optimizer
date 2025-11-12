// lib/tokens.ts (Postgres 版)
import { query } from "@/lib/db";

export type TokenRecord = {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null; // epoch ms
};

async function ensureTokensTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date BIGINT
    )
  `);
}

export async function getTokensByUserId(userId: string): Promise<{
  access_token?: string | null;
  refresh_token?: string | null;
} | null> {
  await ensureTokensTable();
  const { rows } = await query<{
    access_token: string | null;
    refresh_token: string | null;
  }>(`SELECT access_token, refresh_token FROM tokens WHERE user_id = $1`, [
    userId,
  ]);
  if (!rows[0]) return null;
  return {
    access_token: rows[0].access_token ?? null,
    refresh_token: rows[0].refresh_token ?? null,
  };
}

export async function deleteTokensByUserId(userId: string) {
  await ensureTokensTable();
  await query(`DELETE FROM tokens WHERE user_id = $1`, [userId]);
}

export async function saveTokensByUserId(params: {
  userId: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  await ensureTokensTable();
  const {
    userId,
    access_token = null,
    refresh_token = null,
    expiry_date = null,
  } = params;
  await query(
    `INSERT INTO tokens (user_id, access_token, refresh_token, expiry_date)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expiry_date  = EXCLUDED.expiry_date`,
    [userId, access_token, refresh_token, expiry_date]
  );
}

export async function getTokenRecord(
  userId: string
): Promise<TokenRecord | null> {
  await ensureTokensTable();
  const { rows } = await query<TokenRecord>(
    `SELECT user_id, access_token, refresh_token, expiry_date FROM tokens WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}
