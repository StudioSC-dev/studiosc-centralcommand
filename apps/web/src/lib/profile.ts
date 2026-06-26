import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileInput, ProfileResponse } from "@central-command/types";
import { apiGet, apiPut } from "./api";

/** The authenticated user's profile (null until onboarded). Shared options so
 * routes can prefetch it (on link hover) via the query cache. */
export const profileQueryOptions = queryOptions({
  queryKey: ["profile"],
  queryFn: () => apiGet<ProfileResponse>("/api/profile"),
  staleTime: 5 * 60 * 1000,
});

export function useProfile() {
  return useQuery(profileQueryOptions);
}

/**
 * Save profile fields. Invalidates `profile` and `me` — the latter because
 * `profileComplete` (which gates onboarding) may flip once the required fields
 * are filled.
 *
 * The invalidations are awaited so the refetched `me` lands before any per-call
 * `onSuccess` runs. Onboarding navigates to "/" on success, and the index route
 * gates on `me.profileComplete` via `ensureQueryData` — which returns the cached
 * value. Without awaiting, that value is still the stale `profileComplete: false`,
 * bouncing the user back to onboarding and forcing a second submit to "work".
 */
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => apiPut<ProfileResponse>("/api/profile", input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
  });
}
