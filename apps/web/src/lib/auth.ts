import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@central-command/types";
import { apiGet, apiPost } from "./api";

export type Me = MeResponse;

/**
 * Session probe. `retry: false` so a 401 resolves immediately to "not signed
 * in" (the route gate redirects to /login) instead of retrying three times.
 */
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: () => apiGet<MeResponse>("/api/auth/me"),
  retry: false,
  staleTime: 5 * 60 * 1000,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

/** Clear the session server-side, drop cached data, and return to /login. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ ok: true }>("/api/auth/logout", {}),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/login";
    },
  });
}
