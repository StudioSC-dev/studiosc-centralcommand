import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GamingConnectInput, GamingResponse } from "@central-command/types";
import { apiGet, apiPost } from "./api";

/** Riot platform regions offered in the connect UI (card + settings). */
export const RIOT_REGIONS = ["sg2", "na1", "euw1", "eun1", "kr", "jp1", "br1", "oc1"];

export function useGaming() {
  return useQuery({
    queryKey: ["gaming"],
    queryFn: () => apiGet<GamingResponse>("/api/gaming"),
    // Poll so the live "in game" badge appears/clears unattended on the wall
    // display. Aligned to the API's 60s live-status cache (≤1 spectator call/min).
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}

export function useConnectRiot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GamingConnectInput) => apiPost<GamingResponse>("/api/gaming/connect", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gaming"] }),
  });
}

export function useRefreshRiot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<unknown>("/api/gaming/refresh", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gaming"] }),
  });
}
