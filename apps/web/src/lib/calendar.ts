import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarResponse } from "@central-command/types";
import { apiGet, apiPost } from "./api";

/** Fetch the authenticated user's upcoming calendar events + busyness.
 *
 * Polls every 60s — and keeps polling while the tab is unfocused — so the
 * always-on wall display surfaces changes without a manual reload. A Google push
 * webhook busts the API-side cache on real changes, so most polls are cheap
 * cache hits and a change shows up within one poll; the 15-min calendar KV TTL is
 * only a backstop if a push is ever missed. */
export function useCalendar() {
  return useQuery({
    queryKey: ["calendar"],
    queryFn: () => apiGet<CalendarResponse>("/api/calendar"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}

/** Disconnect Google: revokes the grant + drops stored tokens server-side. */
export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ connected: boolean }>("/api/auth/google/disconnect", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
