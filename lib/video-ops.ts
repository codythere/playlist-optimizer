// lib/video-ops.ts
import "server-only";
import { query } from "@/lib/db";

function toSafeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** ✅ 累加（delta > 0 才寫入），回傳最新 total */
export async function addGlobalVideoOps(delta: number): Promise<number> {
  const d = toSafeInt(delta, 0);
  if (d <= 0) return 0;

  const { rows } = await query<{ total: string | number }>(
    `
    UPDATE global_video_ops
       SET total = total + $1,
           updated_at = now()
     WHERE id = 1
     RETURNING total
    `,
    [d],
  );

  return toSafeInt(rows[0]?.total, 0);
}

/** ✅ 讀取目前 total */
export async function getGlobalVideoOps(): Promise<number> {
  const { rows } = await query<{ total: string | number }>(
    `SELECT total FROM global_video_ops WHERE id = 1`,
  );
  return toSafeInt(rows[0]?.total, 0);
}
