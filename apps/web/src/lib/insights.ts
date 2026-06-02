import { useQuery } from "@tanstack/react-query";
import type { InsightsResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Rule-based insights derived from the user's logged data. */
export function useInsights() {
  return useQuery({
    queryKey: ["insights"],
    queryFn: () => apiGet<InsightsResponse>("/api/insights"),
  });
}
