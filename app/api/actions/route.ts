// /app/api/actions/route.ts
import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listActionsPageSafe, getActionCounts } from "@/lib/actions-store";
import { jsonOk, jsonError } from "@/lib/result";
import type { ActionRecord } from "@/types/actions"; // ✅ 新增這行

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limitNum = Number(limitRaw ?? 20);
    const limit = Math.max(
      1,
      Math.min(100, Number.isFinite(limitNum) ? limitNum : 20)
    );
    const cursor = url.searchParams.get("cursor") || undefined;

    console.log(
      "[/api/actions] using listActionsPageSafe; limit, cursor =",
      limit,
      cursor
    );

    const auth = await requireUserId(request);
    if (!auth) {
      return jsonError("unauthorized", "Sign in to continue", { status: 401 });
    }

    // ✅ 型別明確：ActionRecord[]
    const actions: ActionRecord[] = await listActionsPageSafe(
      auth.userId,
      limit + 1,
      cursor
    );
    const hasMore = actions.length > limit;
    const page: ActionRecord[] = hasMore ? actions.slice(0, limit) : actions;

    // ✅ 把 action 標成 ActionRecord，避免隱含 any
    const data = await Promise.all(
      page.map(async (action: ActionRecord) => ({
        action,
        counts: await getActionCounts(action.id),
      }))
    );

    return jsonOk({
      actions: data,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/actions] error:", err);
    return jsonError("internal_error", message, { status: 500 });
  }
}
