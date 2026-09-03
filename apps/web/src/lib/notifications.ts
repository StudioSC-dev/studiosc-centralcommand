import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationStatus, NotificationsResponse } from "@central-command/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

const KEY = ["notifications"] as const;

/**
 * The notifications spine — every source, one feed.
 *
 * **Polling budget:** 60s, ~1,440 requests/day, D1 reads only, **zero KV
 * writes**. Together with the Homelab card this doubles the always-on
 * background load to ~2,880 requests/day — well inside the 100k/day Workers
 * allowance, and costing nothing against the 1,000/day KV write cap that is the
 * project's actual binding constraint.
 */
export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<NotificationsResponse>("/api/notifications"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}

/**
 * Mark one notification read or dismissed.
 *
 * Optimistic, for the same reason the layout toggles are: a row that lingers
 * for a round-trip after you have dealt with it reads as a control that did not
 * work. The count in the badge row is recomputed from the same optimistic state
 * so the two cannot disagree mid-flight.
 */
export function useSetNotificationStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: NotificationStatus }) =>
      apiPatch(`/api/notifications/${id}`, { status }),

    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<NotificationsResponse>(KEY);
      if (previous) {
        const gone = previous.items.find((item) => item.id === id);
        qc.setQueryData<NotificationsResponse>(KEY, {
          ...previous,
          items: previous.items.filter((item) => item.id !== id),
          // Only a feed source's badge moves — a count-only source's number is
          // reported by its collector and is not ours to decrement.
          sources: previous.sources.map((source) =>
            gone && source.source === gone.source
              ? { ...source, unread: Math.max(0, source.unread - 1) }
              : source,
          ),
          totalUnread: Math.max(0, previous.totalUnread - 1),
        });
      }
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous);
    },

    // Refetch rather than trusting the guess: the server may have taken new
    // events in the same window, and the badge must not drift.
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Rename a notification source's display label. */
export function useRenameSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ source, label }: { source: string; label: string }) =>
      apiPatch(`/api/notifications/sources/${source}`, { label }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Remove a notification source and all its notifications. */
export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: string) =>
      apiDelete(`/api/notifications/sources/${source}`),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Clear the feed — the Zero Inbox gesture. Optionally scoped to one source. */
export function useMarkAllRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (source?: string) => apiPost("/api/notifications/read-all", { source }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
