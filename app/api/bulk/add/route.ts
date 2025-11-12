import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkAddSchema } from "@/validators/bulk";
import { performBulkAdd, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";
import { getUserTokens } from "@/lib/google";
import { logger } from "@/lib/logger";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const u = await requireUserId(req as any);
    if (u?.userId) return u.userId;
  } catch {}
  try {
    const store = await cookies();
    const raw = store.get("ytpm_session")?.value;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.userId) return String(parsed.userId);
    }
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parsed = bulkAddSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.message, { status: 400 });
  }
  const payload = parsed.data;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const tokens = await getUserTokens(userId);
  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    logger.warn({ userId }, "[bulk/add] no tokens");
    return jsonError(
      "no_tokens",
      "YouTube authorization missing or expired. Please sign in again.",
      { status: 400 }
    );
  }

  const idempotencyKey =
    request.headers.get("idempotency-key") ??
    payload.idempotencyKey ??
    undefined;

  if (idempotencyKey && (await checkIdempotencyKey(idempotencyKey))) {
    const summary = await getActionSummary(idempotencyKey); // ⬅️ await
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: (payload.videoIds?.length ?? 0) * 50,
        idempotent: true,
      });
    }
  }

  const result = await withTransaction(async (client) => {
    const normalized = {
      targetPlaylistId: payload.targetPlaylistId,
      items: (payload.videoIds ?? []).map((v) => ({ videoId: v })),
    } as any;
    return performBulkAdd(normalized, {
      userId,
      actionId: idempotencyKey,
      pgClient: client,
    } as any);
  });

  if (idempotencyKey) await registerIdempotencyKey(idempotencyKey);

  return jsonOk({ ...result, idempotent: false });
}
