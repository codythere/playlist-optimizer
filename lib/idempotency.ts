// lib/idempotency.ts (Postgres 版)
import { query } from "@/lib/db";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

export async function checkIdempotencyKey(key: string) {
  await ensureTable();
  const { rows } = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM idempotency_keys WHERE key = $1) AS exists`,
    [key]
  );
  return Boolean(rows[0]?.exists);
}

export async function registerIdempotencyKey(key: string) {
  await ensureTable();
  // true = 已存在；false = 本次新註冊成功
  const res = await query(
    `INSERT INTO idempotency_keys(key, created_at)
     VALUES ($1, now())
     ON CONFLICT (key) DO NOTHING`,
    [key]
  );
  // rowCount=0 代表已存在
  return res.rowCount === 0;
}

export async function withIdempotency<T>(
  key: string | undefined | null,
  handler: () => Promise<T>
) {
  if (!key) {
    return { alreadyExisted: false, result: await handler() };
  }
  const already = await checkIdempotencyKey(key);
  if (already) {
    return { alreadyExisted: true, result: undefined as T | undefined };
  }
  const result = await handler();
  await registerIdempotencyKey(key);
  return { alreadyExisted: false, result };
}
