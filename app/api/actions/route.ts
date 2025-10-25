import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listActions, getActionCounts } from "@/lib/actions-store";
import { jsonOk, jsonError } from "@/lib/result";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 20);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Math.max(limitParam, 1), 100);

  const auth = requireUserId();
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const actions = listActions(auth.userId, limit + 1, cursor ?? undefined);
  const hasMore = actions.length > limit;
  const page = hasMore ? actions.slice(0, limit) : actions;

  const data = page.map((action) => ({
    action,
    counts: getActionCounts(action.id),
  }));

  return jsonOk({
    actions: data,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
