"use client";

import * as React from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/use-toast";
import type {
  ActionCounts,
  ActionItemRecord,
  ActionRecord,
} from "@/types/actions";

interface ActionsResponse {
  actions: Array<{
    action: ActionRecord;
    counts: ActionCounts;
  }>;
  nextCursor: string | null;
}

interface ActionSummaryResponse {
  action: ActionRecord;
  counts: ActionCounts;
  items: ActionItemRecord[];
}

interface ApiError extends Error {
  code?: string;
  status?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractApiError(payload: unknown) {
  if (!isRecord(payload)) return null;
  if (payload.ok === false && isRecord(payload.error)) {
    const errorRecord = payload.error as Record<string, unknown>;
    return {
      code: typeof errorRecord.code === "string" ? errorRecord.code : undefined,
      message: typeof errorRecord.message === "string" ? errorRecord.message : undefined,
    };
  }
  return null;
}

function extractApiData<T>(payload: unknown): T | undefined {
  if (!isRecord(payload)) return undefined;
  if (payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return undefined;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let payload: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText || "Request failed");
  } else {
    payload = null;
  }

  const apiError = extractApiError(payload);
  if (!response.ok || apiError) {
    const message = apiError?.message ?? response.statusText ?? "Request failed";
    const error = new Error(message) as ApiError;
    error.code = apiError?.code;
    error.status = response.status;
    throw error;
  }

  const data = extractApiData<T>(payload);
  if (data !== undefined) {
    return data;
  }

  return payload as T;
}

const PAGE_SIZE = 10;

export default function ActionLogClient() {
  const queryClient = useQueryClient();

  const actionsQuery = useInfiniteQuery({
    queryKey: ["actions"],
    queryFn: ({ pageParam }) =>
      apiRequest<ActionsResponse>(
        `/api/actions?limit=${PAGE_SIZE}${pageParam ? `&cursor=${pageParam}` : ""}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const actions = React.useMemo(() => {
    if (!actionsQuery.data) return [] as ActionsResponse["actions"];
    return actionsQuery.data.pages.flatMap((page) => page.actions);
  }, [actionsQuery.data]);

  if (actionsQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading action history...
      </div>
    );
  }

  if (actionsQuery.isError) {
    const error = actionsQuery.error as ApiError;
    if (error.code === "unauthorized") {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          Sign in to view your recent actions.
        </div>
      );
    }
    return (
      <div className="p-6 text-sm text-destructive">
        {error.message || "Failed to load actions"}
      </div>
    );
  }

  if (!actions.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No actions recorded yet. Run a bulk add/move/remove to populate history.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      {actions.map(({ action, counts }) => (
        <ActionCard
          key={action.id}
          action={action}
          counts={counts}
          onRefetch={() => {
            queryClient.invalidateQueries({ queryKey: ["actions"] });
          }}
        />
      ))}

      {actionsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => actionsQuery.fetchNextPage()}
            disabled={actionsQuery.isFetchingNextPage}
          >
            {actionsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

interface ActionCardProps {
  action: ActionRecord;
  counts: ActionCounts;
  onRefetch(): void;
}

function ActionCard({ action, counts, onRefetch }: ActionCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const toggle = React.useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{action.type}  /  {action.status.toUpperCase()}</div>
          <div className="text-xs text-muted-foreground">
            Created {formatTimestamp(action.createdAt)}  /  Finished {formatTimestamp(action.finishedAt)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Source: {action.sourcePlaylistId ?? "-"}  /  Target: {action.targetPlaylistId ?? "-"}
          </div>
          {action.parentActionId ? (
            <div className="text-xs text-muted-foreground">
              Parent action: {action.parentActionId}
            </div>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">
          Success {counts.success}  /  Failed {counts.failed}  /  Total {counts.total}
        </div>
      </div>

      <ActionDetails
        actionId={action.id}
        expanded={expanded}
        onToggle={toggle}
        counts={counts}
        onRefetch={onRefetch}
      />
    </div>
  );
}

interface ActionDetailsProps {
  actionId: string;
  expanded: boolean;
  counts: ActionCounts;
  onToggle(): void;
  onRefetch(): void;
}

function ActionDetails({ actionId, expanded, counts, onToggle, onRefetch }: ActionDetailsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detailsQuery = useQuery({
    queryKey: ["action-summary", actionId],
    queryFn: () => apiRequest<ActionSummaryResponse>(`/api/actions/${actionId}`),
    enabled: expanded,
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiRequest<ActionSummaryResponse>(`/api/actions/${actionId}/retry-failed`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({ title: "Retry scheduled", duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["action-summary", actionId] });
      onRefetch();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Unable to retry";
      toast({ title: "Retry failed", description: message, duration: 4000 });
    },
  });

  const undoMutation = useMutation({
    mutationFn: () =>
      apiRequest<ActionSummaryResponse>(`/api/actions/${actionId}/undo`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({ title: "Undo scheduled", duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["action-summary", actionId] });
      onRefetch();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Unable to undo";
      toast({ title: "Undo failed", description: message, duration: 4000 });
    },
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {expanded ? "Hide items" : "Show items"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => retryMutation.mutate()}
          disabled={counts.failed === 0 || retryMutation.isPending}
        >
          Retry failed
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => undoMutation.mutate()}
          disabled={undoMutation.isPending}
        >
          Undo
        </Button>
      </div>

      {expanded ? (
        detailsQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading items...</div>
        ) : detailsQuery.isError ? (
          <div className="text-xs text-destructive">
            {(detailsQuery.error as Error).message ?? "Failed to load action details"}
          </div>
        ) : detailsQuery.data.items.length === 0 ? (
          <div className="text-xs text-muted-foreground">No recorded items.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Source</th>
                  <th className="py-1 pr-3">Target</th>
                  <th className="py-1 pr-3">Video ID</th>
                  <th className="py-1 pr-3">Item IDs</th>
                  <th className="py-1">Error</th>
                </tr>
              </thead>
              <tbody>
                {detailsQuery.data.items.map((item) => (
                  <tr key={item.id} className="border-t text-xs">
                    <td className="py-2 pr-3 font-medium">{item.type}</td>
                    <td className="py-2 pr-3">{item.status}</td>
                    <td className="py-2 pr-3">{item.sourcePlaylistId ?? "-"}</td>
                    <td className="py-2 pr-3">{item.targetPlaylistId ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{item.videoId ?? "-"}</td>
                    <td className="py-2 pr-3 text-[11px]">
                      <div>Src: {item.sourcePlaylistItemId ?? "-"}</div>
                      <div>Tgt: {item.targetPlaylistItemId ?? "-"}</div>
                    </td>
                    <td className="py-2 text-[11px]">
                      {item.errorCode ? (
                        <div>
                          <span className="font-medium">{item.errorCode}</span>: {item.errorMessage ?? "-"}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
