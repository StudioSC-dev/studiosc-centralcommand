import { useQuery } from "@tanstack/react-query";
import type { LabResponse } from "@central-command/types";
import { apiGet } from "./api";

/**
 * Homelab telemetry — the state half of the integration.
 *
 * **Polling budget** (CLAUDE.md asks for this on every polling card): 60s on an
 * always-on wall display is ~1,440 requests/day. Every one is a D1 read of a
 * single row plus a capped event query — **no KV, so zero KV writes**. The
 * push side costs the same 1,440 D1 row-writes against a 100k/day allowance.
 *
 * Matched to the agent's 60s push cadence deliberately: polling faster cannot
 * produce fresher data, and polling slower would add latency to the one thing
 * this card is for — noticing that the lab has gone quiet.
 */
export function useLab() {
  return useQuery({
    queryKey: ["lab"],
    queryFn: () => apiGet<LabResponse>("/api/lab"),
    refetchInterval: 60_000,
    // The point of the card is a wall display nobody is interacting with.
    refetchIntervalInBackground: true,
  });
}
