import { eq } from "drizzle-orm";
import { gamingProviders } from "@central-command/db";
import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { refreshRiot } from "../services/riot-sync";

/**
 * Riot data refresh — invoked by Cron Triggers (see `wrangler.toml`).
 *
 * Refreshes every connected Riot provider. The 15-minute KV gate inside
 * `refreshRiot` prevents redundant fetches, so running on each tick is safe and
 * keeps dev-key call volume tiny. (Per-user "8am/8pm local" timezone gating is a
 * later refinement — Cron Triggers fire in UTC; for now both daily ticks refresh
 * all users.) One provider failing does not abort the others.
 */
export async function runRiotRefresh(env: Bindings): Promise<void> {
  const db = createDb(env.DB);
  const providers = await db
    .select()
    .from(gamingProviders)
    .where(eq(gamingProviders.provider, "riot"))
    .all();

  for (const p of providers) {
    if (!p.puuid || !p.region) continue;
    try {
      await refreshRiot(db, env, {
        userId: p.userId,
        game: p.game,
        region: p.region,
        puuid: p.puuid,
      });
    } catch (err) {
      console.error(`[cron] riot refresh failed for user ${p.userId}:`, err);
    }
  }
}
