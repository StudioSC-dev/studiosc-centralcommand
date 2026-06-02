import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocationInput, SetLocationResponse, SettingsResponse } from "@central-command/types";
import { apiGet, apiPut } from "./api";

/** The authenticated user's settings plus Cloudflare edge-geo defaults. */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsResponse>("/api/settings"),
  });
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
