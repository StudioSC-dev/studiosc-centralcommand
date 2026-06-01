import type { Bindings } from "../env";

/**
 * Riot data refresh — invoked by Cron Triggers (see `wrangler.toml`).
 *
 * Strategy (from CLAUDE.md / Session 3):
 *   - Runs twice daily; the "8am / 8pm local" rule is enforced per-user by
 *     checking each user's timezone before doing any work.
 *   - A 15-minute KV gate per user guards every fetch — both cron and manual
 *     refreshes check it first and skip the Riot API call if data is fresh.
 *   - Aggressive KV caching, no queue in Phase 1 (dev-key call volume is tiny).
 *
 * This is a Phase 1 stub: the iteration over connected gaming providers and the
 * actual Riot calls land in a later session.
 */
export async function runRiotRefresh(_env: Bindings): Promise<void> {
  console.log("[cron] riot refresh tick — not yet implemented");
}
