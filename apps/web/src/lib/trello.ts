import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrelloConnectionResponse } from "@central-command/types";
import { apiGet, apiPut, apiDelete } from "./api";

const KEY = ["trello"] as const;

export function useTrelloConnection() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<TrelloConnectionResponse>("/api/trello"),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useAddTrelloAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, apiKey, token }: { label: string; apiKey: string; token: string }) =>
      apiPut("/api/trello/accounts", { label, apiKey, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRemoveTrelloAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/trello/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
