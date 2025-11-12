// lib/quota.ts
import "server-only";
import { addUsage, getUsage } from "./quota-db"; // ← 你這支已是 PG + async

export const METHOD_COST = {
  "playlistItems.list": 1,
  "playlistItems.insert": 50,
  "playlistItems.delete": 50,
  "playlists.list": 1,
} as const;

export type MethodName = keyof typeof METHOD_COST;

const DAILY_BUDGET =
  Number(
    process.env.YTPM_DAILY_QUOTA ?? process.env.NEXT_PUBLIC_YTPM_DAILY_QUOTA
  ) || 10_000;

/** 產生 PT（美國太平洋時間）當日 key：YYYY-MM-DD */
function todayKeyPT() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/** 回傳下次 PT 午夜 ISO（保留你原本的做法也行） */
function nextResetAtISO_PT() {
  const nowPT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  const nextPT = new Date(nowPT);
  nextPT.setDate(nowPT.getDate() + 1);
  nextPT.setHours(0, 0, 0, 0);

  const yyyy = nextPT.getFullYear();
  const mm = String(nextPT.getMonth() + 1).padStart(2, "0");
  const dd = String(nextPT.getDate()).padStart(2, "0");

  // 簡化處理 offset；如要更精確可用你原版 offsetText 邏輯
  return `${yyyy}-${mm}-${dd}T00:00:00-08:00`;
}

/** ✅ 寫入配額（global + userId）→ async */
export async function recordQuota(
  _method: MethodName | string,
  units: number,
  userId?: string
): Promise<void> {
  const n = Math.max(0, Math.floor(units || 0));
  if (!n) return;

  const tk = todayKeyPT();
  await addUsage(tk, "global", n);
  if (userId) await addUsage(tk, userId, n);
}

/** ✅ 讀取今日配額（若 user 沒資料 → 回退 global）→ async */
export async function getTodayQuota(userId?: string): Promise<{
  used: number;
  remain: number;
  budget: number;
  resetAtISO: string;
}> {
  const tk = todayKeyPT();
  const resetAtISO = nextResetAtISO_PT();

  const [globalUsed, userUsed] = await Promise.all([
    getUsage(tk, "global"),
    userId ? getUsage(tk, userId) : Promise.resolve(0),
  ]);

  const used = userUsed && userUsed > 0 ? userUsed : globalUsed;
  const budget = DAILY_BUDGET;
  const remain = Math.max(0, budget - used);

  return { used, remain, budget, resetAtISO };
}

/** 保留舊 API（不扣點） */
export async function runWithQuota<T>(
  _method: MethodName | string,
  _cost: number,
  fn: () => Promise<T>
): Promise<T> {
  return fn();
}
