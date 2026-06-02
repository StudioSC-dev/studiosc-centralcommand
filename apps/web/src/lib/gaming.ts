import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GamingConnectInput, GamingResponse } from "@central-command/types";
import { apiGet, apiPost } from "./api";

export function useGaming() {
  return useQuery({
    queryKey: ["gaming"],
    queryFn: () => apiGet<GamingResponse>("/api/gaming"),
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
