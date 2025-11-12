// lib/db.ts (Postgres 版)
import { Pool, PoolClient } from "pg";

let _pool: Pool | null = null;

export function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
  }
  return _pool;
}

export async function query<T = any>(text: string, params?: any[]) {
  const pool = getPool();
  const res = await pool.query<T>(text, params);
  return res; // 使用 res.rows
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
