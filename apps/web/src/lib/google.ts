import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoogleAccountsResponse } from "@central-command/types";
import { apiDelete, apiGet } from "./api";

export function useGoogleAccounts() {
  return useQuery({
    queryKey: ["google-accounts"],
    queryFn: () => apiGet<GoogleAccountsResponse>("/api/auth/google/accounts"),
  });
}

export function useRemoveGoogleAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiDelete<{ removed: boolean }>(`/api/auth/google/accounts/${accountId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-accounts"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}
