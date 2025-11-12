import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkRemoveSchema } from "@/validators/bulk";
import { performBulkRemove, getActionSummary } from "@/lib/actions-service";
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
  const hdr = req.headers.get("x-user-id");
  if (hdr) return hdr;
  return null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parsed = bulkRemoveSchema.safeParse(body);
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
    logger.warn({ userId }, "[bulk/remove] no tokens");
    return jsonError(
      "no_tokens",
      "YouTube authorization missing or expired. Please sign in",
      { status: 400 }
    );
  }

  const idemKey =
    request.headers.get("idempotency-key") ??
    payload.idempotencyKey ??
    undefined;

  if (idemKey && (await checkIdempotencyKey(idemKey))) {
    const summary = await getActionSummary(idemKey); // ⬅️ await
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: (payload.playlistItemIds?.length ?? 0) * 50,
        idempotent: true,
      });
    }
  }

  const result = await withTransaction(async (client) => {
    return performBulkRemove(payload, {
      userId,
      actionId: idemKey,
      pgClient: client,
    } as any);
  });

  if (idemKey) await registerIdempotencyKey(idemKey);

  return jsonOk({ ...result, idempotent: false });
}
