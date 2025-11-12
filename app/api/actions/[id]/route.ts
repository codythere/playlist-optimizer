import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionById, getActionCounts } from "@/lib/actions-store";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId(req);
    if (!auth) {
      return jsonError("unauthorized", "Sign in required", { status: 401 });
    }

    const { id } = await ctx.params;

    const action = await getActionById(id); // ⬅️ 必須 await
    if (!action) {
      return jsonError("not_found", "Action not found", { status: 404 });
    }
    if (action.userId !== auth.userId) {
      return jsonError("forbidden", "You do not have access to this action", {
        status: 403,
      });
    }

    const counts = await getActionCounts(id); // ⬅️ 必須 await
    return jsonOk({ action, counts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
