import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkAddSchema } from "@/validators/bulk";
import { performBulkAdd, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";

const DEFAULT_USER_ID = "default-user";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return jsonError("invalid_json", "Invalid JSON body", { status: 400 });
  }

  const parseResult = bulkAddSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonError("validation_error", parseResult.error.message, { status: 400 });
  }

  const payload = parseResult.data;
  const session = getSession();
  const userId = session?.userId ?? DEFAULT_USER_ID;

  const idempotencyKey =
    request.headers.get("idempotency-key") ?? payload.idempotencyKey ?? undefined;

  if (idempotencyKey && checkIdempotencyKey(idempotencyKey)) {
    const summary = getActionSummary(idempotencyKey);
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: payload.videoIds.length * 50,
        idempotent: true,
      });
    }
  }

  const result = await performBulkAdd(payload, {
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