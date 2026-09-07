import { useQuery } from "@tanstack/react-query";
import type { UrgentTicketsResponse } from "@central-command/types";
import { apiGet } from "./api";

const KEY = ["tickets"] as const;

export function useUrgentTickets() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<UrgentTicketsResponse>("/api/tickets"),
    refetchInterval: 5 * 60 * 1000,
  });
}
