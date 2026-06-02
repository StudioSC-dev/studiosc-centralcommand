import { useQuery } from "@tanstack/react-query";
import type { PerformanceResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the user's daily performance score + recent history. */
export function usePerformance() {
  return useQuery({
    queryKey: ["performance"],
    queryFn: () => apiGet<PerformanceResponse>("/api/performance"),
  });
}
