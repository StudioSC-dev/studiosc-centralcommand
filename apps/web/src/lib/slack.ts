import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SlackConnectionResponse } from "@central-command/types";
import { apiGet, apiPut, apiDelete } from "./api";

const KEY = ["slack"] as const;

export function useSlackConnection() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<SlackConnectionResponse>("/api/slack"),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useAddSlackAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, token }: { label: string; token: string }) =>
      apiPut("/api/slack/accounts", { label, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRemoveSlackAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/slack/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
