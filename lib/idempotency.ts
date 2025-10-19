import { db } from "./db";

const insertKey = db.prepare("INSERT OR IGNORE INTO idempotency_keys (key, created_at) VALUES (?, CURRENT_TIMESTAMP)");
const selectKey = db.prepare("SELECT key FROM idempotency_keys WHERE key = ?");

export function checkIdempotencyKey(key: string) {
  const row = selectKey.get(key) as { key: string } | undefined;
  return Boolean(row);
}

export function registerIdempotencyKey(key: string) {
  const info = insertKey.run(key);
  return info.changes === 0;
}

export async function withIdempotency<T>(key: string | undefined | null, handler: () => Promise<T>) {
  if (!key) {
    return {
      alreadyExisted: false,
      result: await handler(),
    };
  }

  const already = checkIdempotencyKey(key);
  if (already) {
    return {
      alreadyExisted: true,
      result: undefined as T | undefined,
    };
  }

  const result = await handler();
  registerIdempotencyKey(key);
  return {
    alreadyExisted: false,
    result,
  };
}