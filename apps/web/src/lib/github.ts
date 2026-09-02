import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GitHubActivityResponse } from "@central-command/types";
import { apiGet, apiPut, apiDelete } from "./api";

const KEY = ["github"] as const;

export function useGitHubActivity() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<GitHubActivityResponse>("/api/github"),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useSetGitHubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => apiPut("/api/github/token", { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveGitHubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete("/api/github/token"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddGitHubAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, token }: { label: string; token: string }) =>
      apiPut("/api/github/accounts", { label, token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveGitHubAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/github/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
