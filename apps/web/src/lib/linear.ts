import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinearConnectionResponse } from "@central-command/types";
import { apiGet, apiPut, apiDelete } from "./api";

const KEY = ["linear"] as const;

export function useLinearConnection() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<LinearConnectionResponse>("/api/linear"),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useAddLinearAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, apiKey }: { label: string; apiKey: string }) =>
      apiPut("/api/linear/accounts", { label, apiKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRemoveLinearAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/linear/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
