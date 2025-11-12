import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkMoveSchema } from "@/validators/bulk";
import { performBulkMove, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";
import { getYouTubeClientEx } from "@/lib/google";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parsed = bulkMoveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.message, { status: 400 });
  }
  const payload = parsed.data;

  const auth = await requireUserId(request);
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }
  const userId = auth.userId;

  try {
    const { yt, mock } = await getYouTubeClientEx({
      userId,
      requireReal: true,
    });
    if (!yt || mock) {
      return jsonError(
        "no_tokens",
        "YouTube authorization missing or expired. Please sign in again.",
        { status: 400 }
      );
    }
  } catch (err: any) {
    const code = err?.code === "NO_TOKENS" ? "no_tokens" : "internal_error";
    const status = err?.code === "NO_TOKENS" ? 400 : 500;
    return jsonError(code, err?.message ?? "Failed to init YouTube client", {
      status,
    });
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
        estimatedQuota: (payload.items?.length ?? 0) * 100,
        idempotent: true,
      });
    }
  }

  const result = await withTransaction(async (client) => {
    return performBulkMove(payload, {
      userId,
      actionId: idempotencyKey,
      pgClient: client,
    } as any);
  });

  if (idempotencyKey) await registerIdempotencyKey(idempotencyKey);

  return jsonOk({ ...result, idempotent: false });
}
