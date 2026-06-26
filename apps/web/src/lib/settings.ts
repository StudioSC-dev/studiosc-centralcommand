import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocationInput, SetLocationResponse, SettingsResponse } from "@central-command/types";
import { apiGet, apiPut } from "./api";

/** The authenticated user's settings plus Cloudflare edge-geo defaults. Shared
 * options so routes can prefetch them (on link hover) via the query cache. */
export const settingsQueryOptions = queryOptions({
  queryKey: ["settings"],
  queryFn: () => apiGet<SettingsResponse>("/api/settings"),
  staleTime: 5 * 60 * 1000,
});

export function useSettings() {
  return useQuery(settingsQueryOptions);
}

/**
 * Set the user's home location (+ timezone). Because the timezone drives the
 * server-side "today" boundary, this invalidates every pillar whose result is
 * day-scoped, not just weather.
 */
export function useSetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LocationInput) =>
      apiPut<SetLocationResponse>("/api/settings/location", input),
    onSuccess: () => {
      for (const key of ["settings", "weather", "summary", "calendar", "performance"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
