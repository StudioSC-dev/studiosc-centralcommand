import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileInput, ProfileResponse } from "@central-command/types";
import { apiGet, apiPut } from "./api";

/** The authenticated user's profile (null until onboarded). */
export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => apiGet<ProfileResponse>("/api/profile"),
  });
}

/**
 * Save profile fields. Invalidates `profile` and `me` — the latter because
 * `profileComplete` (which gates onboarding) may flip once the required fields
 * are filled.
 */
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => apiPut<ProfileResponse>("/api/profile", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
