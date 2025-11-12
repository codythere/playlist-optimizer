// lib/quota-db.ts (Postgres 版)
import { query } from "@/lib/db";

/** 取得 PT 當天日期字串：YYYY-MM-DD */
function todayKeyPT(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/** 取得 PT（今天 - N 天）日期字串 */
function pastKeyPT(days: number): string {
  const nowPT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  const cut = new Date(nowPT);
  cut.setDate(nowPT.getDate() - Math.max(0, Math.floor(days || 0)));
  const yyyy = cut.getFullYear();
  const mm = String(cut.getMonth() + 1).padStart(2, "0");
  const dd = String(cut.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS quota_usage (
      date_key TEXT NOT NULL,
      scope    TEXT NOT NULL,
      used     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date_key, scope)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS quota_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_quota_scope_date ON quota_usage(scope, date_key)
  `);
}

async function getMeta(key: string): Promise<string | null> {
  await ensureTables();
  const { rows } = await query<{ value: string }>(
    `SELECT value FROM quota_meta WHERE key = $1`,
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setMeta(key: string, value: string) {
  await ensureTables();
  await query(
    `INSERT INTO quota_meta(key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

export interface MaintenanceOptions {
  retentionDays?: number;
  vacuumIntervalDays?: number; // PG 可忽略，保留參數不動作
}

const DEFAULT_RETENTION_DAYS = 35;

let _lastMaintenanceMs = 0;

async function pruneOldUsage(retentionDays: number) {
  await ensureTables();
  const cutoff = pastKeyPT(retentionDays);
  await query(`DELETE FROM quota_usage WHERE date_key < $1`, [cutoff]);
  await setMeta("last_prune_pt", todayKeyPT());
}

async function maybeVacuum(_intervalDays: number) {
  // 在託管 PG 上通常不手動 VACUUM，交給 autovacuum
  await setMeta("last_vacuum_pt", todayKeyPT());
}

function shouldThrottle(): boolean {
  const now = Date.now();
  if (now - _lastMaintenanceMs < 60 * 60 * 1000) return true;
  _lastMaintenanceMs = now;
  return false;
}

/** 輕量維護（刪舊資料 + 標記 vacuum 時間） */
async function maintainQuotaStore(opts?: MaintenanceOptions) {
  if (shouldThrottle()) return;
  const retentionDays = opts?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  await pruneOldUsage(retentionDays);
  await maybeVacuum(opts?.vacuumIntervalDays ?? 7);
}

/** 對外 API（相容原介面） */
export async function ensureQuotaTables() {
  await ensureTables();
}

export async function addUsage(dateKey: string, scope: string, delta: number) {
  await ensureTables();
  await query(
    `INSERT INTO quota_usage (date_key, scope, used)
     VALUES ($1, $2, $3)
     ON CONFLICT (date_key, scope)
     DO UPDATE SET used = quota_usage.used + EXCLUDED.used`,
    [dateKey, scope, Math.max(0, Math.floor(delta || 0))]
  );
  await maintainQuotaStore();
}

export async function getUsage(
  dateKey: string,
  scope: string
): Promise<number> {
  await ensureTables();
  const { rows } = await query<{ used: number }>(
    `SELECT used FROM quota_usage WHERE date_key = $1 AND scope = $2`,
    [dateKey, scope]
  );
  return rows[0]?.used ?? 0;
}

export async function maintenance(options?: MaintenanceOptions) {
  await ensureTables();
  await pruneOldUsage(options?.retentionDays ?? DEFAULT_RETENTION_DAYS);
  await maybeVacuum(options?.vacuumIntervalDays ?? 7);
}
