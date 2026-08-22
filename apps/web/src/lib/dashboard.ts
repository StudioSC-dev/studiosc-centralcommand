import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CARD_KEYS, type CardKey, type DashboardLayoutResponse } from "@central-command/types";
import { apiGet, apiPatch } from "./api";

/** The user's card layout. Shared options so the dashboard route can prefetch
 * it on link intent, the same way settings does. */
export const dashboardLayoutQueryOptions = queryOptions({
  queryKey: ["dashboard-layout"],
  queryFn: () => apiGet<DashboardLayoutResponse>("/api/dashboard/layout"),
  // The layout only changes when this user changes it, and the mutation below
  // writes the response straight into the cache — so there is nothing to poll for.
  staleTime: Infinity,
});

export function useDashboardLayout() {
  return useQuery(dashboardLayoutQueryOptions);
}

/**
 * Replace the hidden set.
 *
 * Optimistic, because a card appearing or vanishing a request later feels
 * broken on a toggle. On success the server's normalised layout replaces the
 * guess; on failure the snapshot is rolled back.
 */
export function useSetHiddenCards() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (hidden: CardKey[]) =>
      apiPatch<DashboardLayoutResponse>("/api/dashboard/layout", { hidden }),

    onMutate: async (hidden) => {
      await qc.cancelQueries({ queryKey: dashboardLayoutQueryOptions.queryKey });
      const previous = qc.getQueryData<DashboardLayoutResponse>(
        dashboardLayoutQueryOptions.queryKey,
      );

      // Mirror the server's derivation so the optimistic state matches what
      // comes back, including registry ordering.
      const hiddenSet = new Set(hidden);
      qc.setQueryData<DashboardLayoutResponse>(dashboardLayoutQueryOptions.queryKey, {
        layout: {
          hidden: CARD_KEYS.filter((key) => hiddenSet.has(key)),
          visible: CARD_KEYS.filter((key) => !hiddenSet.has(key)),
        },
      });

      return { previous };
    },

    onError: (_err, _hidden, context) => {
      if (context?.previous) {
        qc.setQueryData(dashboardLayoutQueryOptions.queryKey, context.previous);
      }
    },

    onSuccess: (data) => {
      qc.setQueryData(dashboardLayoutQueryOptions.queryKey, data);
    },
  });
}

/** Convenience: toggle one card's visibility against the current layout. */
export function useToggleCard() {
  const { data } = useDashboardLayout();
  const setHidden = useSetHiddenCards();

  return {
    ...setHidden,
    toggle: (key: CardKey) => {
      const hidden = data?.layout.hidden ?? [];
      const next = hidden.includes(key)
        ? hidden.filter((k) => k !== key)
        : [...hidden, key];
      setHidden.mutate(next);
    },
  };
}
