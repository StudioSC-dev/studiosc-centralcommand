import { useQuery } from "@tanstack/react-query";
import type { CalendarResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the authenticated user's upcoming calendar events + busyness.
 *
 * Polls every 3 minutes — and keeps polling while the tab is unfocused — so the
 * always-on wall display surfaces newly-added events without a manual reload.
 * Freshness is ultimately bounded by the calendar KV TTL on the API side (3 min). */
export function useCalendar() {
  return useQuery({
    queryKey: ["calendar"],
    queryFn: () => apiGet<CalendarResponse>("/api/calendar"),
    refetchInterval: 180_000,
    refetchIntervalInBackground: true,
  });
}
