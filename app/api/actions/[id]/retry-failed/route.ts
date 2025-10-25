import { jsonError, jsonOk } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionSummary, retryFailed } from "@/lib/actions-service";

export async function POST(_request: Request, context: { params: { id: string } }) {
  const auth = requireUserId();
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const actionId = context.params.id;
  const summary = getActionSummary(actionId);
  if (!summary || summary.action.userId !== auth.userId) {
    return jsonError("invalid_request", "Action not found", { status: 404 });
  }

  const hasFailedItems = summary.items.some((item) => item.status === "failed");
  if (!hasFailedItems) {
    return jsonError("invalid_request", "No failed items to retry", { status: 400 });
  }

  const result = await retryFailed(actionId, { userId: auth.userId });
  if (!result) {
    return jsonError("invalid_request", "Unable to retry failed items", { status: 400 });
  }

  return jsonOk(result);
}
