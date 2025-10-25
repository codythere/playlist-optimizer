import { jsonError, jsonOk } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionSummary } from "@/lib/actions-service";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const auth = requireUserId();
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const actionId = context.params.id;
  const summary = getActionSummary(actionId);
  if (!summary || summary.action.userId !== auth.userId) {
    return jsonError("invalid_request", "Action not found", { status: 404 });
  }

  return jsonOk(summary);
}
