import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FocusSessionInput, FocusSessionsResponse } from "@central-command/types";
import { apiGet, apiPost } from "./api";

const KEY = ["focus"] as const;

export function useFocusSessions() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<FocusSessionsResponse>("/api/focus/sessions"),
    refetchInterval: 60_000,
  });
}

export function useCreateFocusSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FocusSessionInput) => apiPost("/api/focus/sessions", input),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
