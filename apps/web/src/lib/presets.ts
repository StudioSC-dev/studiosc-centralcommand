import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SAVED_PRESET_LIMIT,
  fitsGrid,
  layoutArrangement,
  matchingSavedPresetIds,
  type CardKey,
  type CardSizes,
  type DashboardLayout,
  type SavedPreset,
  type SavedPresetResponse,
  type SavedPresetsResponse,
} from "@central-command/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { useDashboardLayout } from "./dashboard";

const PRESETS_KEY = ["dashboard-presets"] as const;

/**
 * The user's saved presets (docs/ui-suite.md Phase 7).
 *
 * A separate query from the layout on purpose. They change on different events
 * — the layout on every hide, drag and resize; this list only when a preset is
 * saved, renamed or deleted — and folding them into one response would make
 * every layout write re-send a list that did not change.
 */
export function useSavedPresets() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: () => apiGet<SavedPresetsResponse>("/api/dashboard/presets"),
    // Same reasoning as the layout query: this only changes when this user
    // changes it, and every mutation below writes the result into the cache.
    staleTime: Infinity,
  });
}

/**
 * Save the arrangement currently on screen under a name.
 *
 * Not optimistic, unlike the layout writes. The server assigns the id, and the
 * two failures that matter here — a duplicate name and the eight-preset limit —
 * are things only the server can settle. A chip that appears and then vanishes
 * with an error is worse than one that appears a moment later.
 */
export function useSavePreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; visible: CardKey[]; sizes: CardSizes }) =>
      apiPost<SavedPresetResponse>("/api/dashboard/presets", input),
    onSuccess: (data) => {
      qc.setQueryData<SavedPresetsResponse>(PRESETS_KEY, (prev) => ({
        presets: [...(prev?.presets ?? []), data.preset],
      }));
    },
  });
}

/** Rename a saved preset, and/or re-capture it at the current arrangement. */
export function useUpdatePreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      visible?: CardKey[];
      sizes?: CardSizes;
    }) => apiPatch<SavedPresetResponse>(`/api/dashboard/presets/${id}`, input),
    onSuccess: (data) => {
      qc.setQueryData<SavedPresetsResponse>(PRESETS_KEY, (prev) => ({
        presets: (prev?.presets ?? []).map((p) => (p.id === data.preset.id ? data.preset : p)),
      }));
    },
  });
}

/**
 * Delete a saved preset.
 *
 * Optimistic, because unlike saving there is nothing the server can tell us
 * that we do not already know, and a chip that lingers after being dismissed
 * reads as a failed click. The layout is untouched: the arrangement stays on
 * screen, it just stops having a name.
 */
export function useDeletePreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: string }>(`/api/dashboard/presets/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: PRESETS_KEY });
      const previous = qc.getQueryData<SavedPresetsResponse>(PRESETS_KEY);
      qc.setQueryData<SavedPresetsResponse>(PRESETS_KEY, {
        presets: (previous?.presets ?? []).filter((p) => p.id !== id),
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(PRESETS_KEY, context.previous);
    },
  });
}

/**
 * Everything the preset row needs about the *saved* half.
 *
 * `matching` is a list rather than a single id: a user can save an arrangement
 * identical to Wall or to another of their own presets, and there is no honest
 * way to pick a winner — so every chip that describes what is on screen lights
 * up, and the built-in match is computed independently of these.
 */
export function useSavedPresetState(): {
  presets: SavedPreset[];
  matching: string[];
  atLimit: boolean;
  /** The arrangement a Save would capture, or null before the layout loads. */
  current: { visible: CardKey[]; sizes: CardSizes } | null;
  /** Whether that arrangement is one the server would store at all. */
  fits: boolean;
  /** Why saving is unavailable right now, or null if it is available. */
  blocked: string | null;
} {
  const { data: layoutData } = useDashboardLayout();
  const { data } = useSavedPresets();
  const layout: DashboardLayout | undefined = layoutData?.layout;
  const presets = data?.presets ?? [];
  const atLimit = presets.length >= SAVED_PRESET_LIMIT;

  const arrangement = layout ? layoutArrangement(layout) : null;
  const current = arrangement
    ? { visible: [...arrangement.visible], sizes: arrangement.sizes }
    : null;

  // The live layout is *allowed* to overflow — restoring a hidden card must
  // never be refused, so hides and reorders are warned about rather than
  // blocked (D9). A preset is the opposite: the server refuses to store one
  // that does not fit, because the alternative is a chip that only fails when
  // it is applied. Without this check Save would be an enabled button that
  // 400s, so the same `fitsGrid` that greys out a size option greys this out.
  const fits = current !== null && fitsGrid(current.visible, current.sizes);

  return {
    presets,
    matching: layout ? matchingSavedPresetIds(layout, presets) : [],
    atLimit,
    current,
    fits,
    blocked: !current
      ? "Loading the layout…"
      : current.visible.length === 0
        ? "There's nothing on the dashboard to save."
        : !fits
          ? "This layout is too tall for one screen. Shrink or hide a card first."
          : atLimit
            ? `You've saved ${SAVED_PRESET_LIMIT} presets. Delete one first.`
            : null,
  };
}
