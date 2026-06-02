import { useQuery } from "@tanstack/react-query";
import type { SummaryResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the cross-pillar overview. */
export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: () => apiGet<SummaryResponse>("/api/summary"),
  });
}
