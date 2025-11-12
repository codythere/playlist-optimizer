// server-only PG 版：以資料庫持久化 quota
import "server-only";
import { query } from "@/lib/db";

export async function addUsage(dateKey: string, scope: string, delta: number) {
  if (!Number.isFinite(delta) || delta <= 0) return;
  await query(
    `
    INSERT INTO quota_usage (date_key, scope, used)
    VALUES ($1, $2, $3)
    ON CONFLICT (date_key, scope)
    DO UPDATE SET used = quota_usage.used + EXCLUDED.used
    `,
    [dateKey, scope, Math.floor(delta)]
  );
}

export async function getUsage(
  dateKey: string,
  scope: string
): Promise<number> {
  const { rows } = await query<{ used: number }>(
    `SELECT used FROM quota_usage WHERE date_key = $1 AND scope = $2`,
    [dateKey, scope]
  );
  return rows[0]?.used ?? 0;
}
