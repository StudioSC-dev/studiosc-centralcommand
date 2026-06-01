import { useQuery } from "@tanstack/react-query";
import type { CalendarResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the authenticated user's upcoming calendar events + busyness. */
export function useCalendar() {
  return useQuery({
    queryKey: ["calendar"],
    queryFn: () => apiGet<CalendarResponse>("/api/calendar"),
  });
}
