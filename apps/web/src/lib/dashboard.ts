import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  DEFAULT_CARD_SIZE,
  fitsGrid,
  normaliseCardSizes,
  resolveCardOrder,
  type CardKey,
  type CardSize,
  type CardSizes,
  type DashboardLayoutInput,
  type DashboardLayoutResponse,
} from "@central-command/types";
import { apiGet, apiPatch } from "./api";
import { useCardKey } from "./editMode";

const LAYOUT_MUTATION_KEY = ["dashboard-layout", "set-hidden"] as const;

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
    // Keyed so any component can observe this mutation's failures, wherever it
    // was fired from — see `useLayoutError`. The remove badge lives on a card
    // and the error has to surface in the edit bar.
    mutationKey: LAYOUT_MUTATION_KEY,
    mutationFn: (input: DashboardLayoutInput) =>
      apiPatch<DashboardLayoutResponse>("/api/dashboard/layout", input),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: dashboardLayoutQueryOptions.queryKey });
      const previous = qc.getQueryData<DashboardLayoutResponse>(
        dashboardLayoutQueryOptions.queryKey,
      );

      // Mirror the server's derivation exactly — same `resolveCardOrder`, same
      // subtraction — so the optimistic state matches what comes back and the
      // grid doesn't twitch when the response lands.
      const hidden = input.hidden ?? previous?.layout.hidden ?? [];
      const order = resolveCardOrder(input.order ?? previous?.layout.order ?? []);
      const sizes = normaliseCardSizes(input.sizes ?? previous?.layout.sizes);
      const hiddenSet = new Set(hidden);
      qc.setQueryData<DashboardLayoutResponse>(dashboardLayoutQueryOptions.queryKey, {
        layout: {
          hidden: order.filter((key) => hiddenSet.has(key)),
          order,
          visible: order.filter((key) => !hiddenSet.has(key)),
          sizes,
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

/**
 * The most recent layout-save failure, from wherever it was triggered.
 *
 * A failed save rolls the optimistic toggle back, and a rollback with nothing
 * explaining it reads as a control that simply refuses to work — which is
 * exactly how the first version of this felt. The mutation fires from the card
 * badges but the only sensible place to report it is the edit bar, so the error
 * is read from the shared mutation cache rather than a local hook result.
 */
export function useLayoutError(): Error | null {
  const errors = useMutationState({
    filters: { mutationKey: LAYOUT_MUTATION_KEY, status: "error" },
    select: (mutation) => mutation.state.error as Error | null,
  });
  return errors.length > 0 ? (errors[errors.length - 1] ?? null) : null;
}

/**
 * Move a visible card to a new position among the visible cards.
 *
 * Takes positions within the *visible* list because that is what the user is
 * looking at, and splices the result back into the full order so hidden cards
 * keep their places and reappear where they were left.
 */
export function useMoveCard() {
  const { data } = useDashboardLayout();
  const setLayout = useSetHiddenCards();

  return (from: number, to: number) => {
    const layout = data?.layout;
    if (!layout) return;

    const visible = [...layout.visible];
    if (from < 0 || to < 0 || from >= visible.length || to >= visible.length || from === to) return;

    const [moved] = visible.splice(from, 1);
    if (!moved) return;
    visible.splice(to, 0, moved);

    // Rebuild the total order by walking the old one and drawing visible slots
    // from the reordered list, leaving hidden keys exactly where they sit.
    let cursor = 0;
    const hiddenSet = new Set(layout.hidden);
    const order = layout.order.map((key) => (hiddenSet.has(key) ? key : visible[cursor++]!));

    setLayout.mutate({ order });
  };
}

/**
 * The size of the card currently rendering.
 *
 * Read from context rather than passed down, because the dashboard route does
 * not own the `<Card>` element — each card component renders its own shell. The
 * key comes from `CardKeyContext` (already supplied for the remove badge), so a
 * card gets its span class without knowing anything about sizing, and both of
 * the formerly hand-rolled shells inherit it for free by delegating to `Card`.
 *
 * Outside the dashboard `useCardKey()` is null and every card is `1x1`.
 */
export function useCardSize(): CardSize {
  const key = useCardKey();
  const { data } = useDashboardLayout();
  if (!key) return DEFAULT_CARD_SIZE;
  return data?.layout.sizes[key] ?? DEFAULT_CARD_SIZE;
}

/**
 * Resize one card, and answer which sizes it may take.
 *
 * `allows` runs the same `fitsGrid` the server validates with, against the
 * layout as it stands, so an option is greyed out exactly when the write would
 * be refused (D5/D6). Cheap enough to call per option per render: five
 * candidates over at most a dozen cells.
 */
export function useSetCardSize() {
  const { data } = useDashboardLayout();
  const setLayout = useSetHiddenCards();
  const layout = data?.layout;

  const withSize = (key: CardKey, size: CardSize): CardSizes =>
    normaliseCardSizes({ ...layout?.sizes, [key]: size });

  return {
    ...setLayout,
    /** Would the dashboard still fit the wall with this card at this size? */
    allows: (key: CardKey, size: CardSize): boolean =>
      layout ? fitsGrid(layout.visible, withSize(key, size)) : false,
    setSize: (key: CardKey, size: CardSize) => {
      if (!layout || (layout.sizes[key] ?? DEFAULT_CARD_SIZE) === size) return;
      setLayout.mutate({ sizes: withSize(key, size) });
    },
  };
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
      setHidden.mutate({ hidden: next });
    },
  };
}
