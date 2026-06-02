import { and, eq } from "drizzle-orm";
import { gamingSnapshots } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";
import { getLeagueEntriesByPuuid, getMatchIds, getParsedMatch, resolveRegion } from "./riot";
import { scoreMatch } from "./riot-score";

const RATE_GATE_TTL = 15 * 60; // seconds — CLAUDE.md Riot gate
const REFRESH_COUNT = 5; // matches per regular refresh
const BACKFILL_COUNT = 20; // matches on first connection (cold start)

const gateKey = (userId: string) => `riot:gate:${userId}`;

/** The provider fields the sync needs (resolved at connect time). */
export interface RiotProvider {
  userId: string;
  game: string;
  region: string; // platform id
  puuid: string;
}

export interface RefreshResult {
  skipped: boolean;
  reason?: string;
  matchesAdded?: number;
}

/**
 * Refresh a user's Riot data: append current ranked standings and ingest any
 * new matches (scored). A 15-minute KV gate guards every refresh; pass
 * `force: true` for the cold-start backfill (which still arms the gate).
 */
export async function refreshRiot(
  db: Database,
  env: Bindings,
  provider: RiotProvider,
  opts: { force?: boolean; backfill?: boolean } = {},
): Promise<RefreshResult> {
  if (!opts.force) {
    const fresh = await env.CACHE.get(gateKey(provider.userId));
    if (fresh) return { skipped: true, reason: "Refreshed within the last 15 minutes." };
  }
  await env.CACHE.put(gateKey(provider.userId), String(Date.now()), {
    expirationTtl: RATE_GATE_TTL,
  });

  const { platform, match } = resolveRegion(provider.region);
  const key = env.RIOT_API_KEY;
  const now = Date.now();

  // ── Ranked standings (append a snapshot) ──
  const entries = await getLeagueEntriesByPuuid(provider.puuid, platform, key);
  for (const e of entries) {
    const queueType =
      e.queueType === "RANKED_SOLO_5x5" ? "solo" : e.queueType === "RANKED_FLEX_SR" ? "flex" : null;
    if (!queueType) continue;
    await db.insert(gamingSnapshots).values({
      id: newId(),
      userId: provider.userId,
      game: provider.game,
      kind: "rank",
      capturedAt: now,
      queueType,
      tier: e.tier,
      division: e.rank,
      leaguePoints: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
    });
  }

  // ── Matches (dedupe by matchId, score each) ──
  const ids = await getMatchIds(
    provider.puuid,
    match,
    key,
    opts.backfill ? BACKFILL_COUNT : REFRESH_COUNT,
  );

  const existing = await db
    .select({ matchId: gamingSnapshots.matchId })
    .from(gamingSnapshots)
    .where(and(eq(gamingSnapshots.userId, provider.userId), eq(gamingSnapshots.kind, "match")))
    .all();
  const seen = new Set(existing.map((r) => r.matchId));

  let matchesAdded = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    const pm = await getParsedMatch(id, provider.puuid, match, key);
    if (!pm) continue;
    await db.insert(gamingSnapshots).values({
      id: newId(),
      userId: provider.userId,
      game: provider.game,
      kind: "match",
      capturedAt: pm.playedAt,
      matchId: pm.matchId,
      champion: pm.champion,
      position: pm.position,
      queueId: pm.queueId,
      win: pm.win ? 1 : 0,
      kills: pm.kills,
      deaths: pm.deaths,
      assists: pm.assists,
      cs: pm.cs,
      durationSec: pm.durationSec,
      score: scoreMatch(pm),
    });
    matchesAdded++;
  }

  return { skipped: false, matchesAdded };
}
