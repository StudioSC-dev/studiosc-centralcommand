import { useQuery } from "@tanstack/react-query";
import type { NewsResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch aggregated RSS headlines across all topics. */
export function useNews() {
  return useQuery({
    queryKey: ["news"],
    queryFn: () => apiGet<NewsResponse>("/api/news"),
  });
}
