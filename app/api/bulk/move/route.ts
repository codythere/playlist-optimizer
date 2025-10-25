import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkMoveSchema } from "@/validators/bulk";
import { performBulkMove, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parseResult = bulkMoveSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonError("invalid_request", parseResult.error.message, { status: 400 });
  }

  const payload = parseResult.data;
  const auth = requireUserId();
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const userId = auth.userId;
  const idempotencyKey =
    request.headers.get("idempotency-key") ?? payload.idempotencyKey ?? undefined;

  if (idempotencyKey && checkIdempotencyKey(idempotencyKey)) {
    const summary = getActionSummary(idempotencyKey);
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: payload.items.length * 100,
        idempotent: true,
      });
    }
  }

  const result = await performBulkMove(payload, {
    userId,
    actionId: idempotencyKey,
  });

  if (idempotencyKey) {
    registerIdempotencyKey(idempotencyKey);
  }

  return jsonOk({
    ...result,
    idempotent: false,
  });
}
