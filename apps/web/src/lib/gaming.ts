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
    // display. Kept SHORTER than the API's 5-min live-status cache (LIVE_TTL in
    // routes/gaming.ts) so most polls are cheap cache hits — matching the two
    // guaranteed a KV write and a spectator call on every poll. Worst-case badge
    // latency is TTL + this interval (~7 min), which is fine against a ~30-min
    // game. Don't raise this above LIVE_TTL.
    refetchInterval: 2 * 60_000,
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
