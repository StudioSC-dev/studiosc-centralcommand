import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { isWithinDays, leagueQueue } from "@central-command/utils";
import { gamingProviders, gamingSnapshots } from "@central-command/db";
import type {
  GamingConnectInput,
  GamingData,
  LiveGame,
  MatchSummary,
  RankInfo,
} from "@central-command/types";
import type { AppEnv, Bindings } from "../env";
import type { Context } from "hono";
import { createDb } from "../lib/db";
import type { Database } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";
import { RiotError, getAccountByRiotId, getActiveGame, resolveRegion } from "../services/riot";
import { refreshRiot } from "../services/riot-sync";
import { allowGlobalDaily, allowUserDaily } from "../services/rate-limit";

/** Build params the gaming response assembly needs. */
interface ProviderRef {
  userId: string;
  riotId: string;
  region: string;
  puuid: string;
}

/**
 * Live game status, KV-cached 60s per user so polling/dashboard loads don't each
 * spend a spectator API call. Caches the "not in game" result too. Spectator
 * errors degrade to `null` — they must never break the card.
 */
async function getLive(env: Bindings, ref: ProviderRef): Promise<LiveGame | null> {
  const key = `riot:live:${ref.userId}`;
  const cached = await env.CACHE.get(key);
  if (cached !== null) return JSON.parse(cached) as LiveGame | null;

  let live: LiveGame | null = null;
  try {
    const { platform } = resolveRegion(ref.region);
    const g = await getActiveGame(ref.puuid, platform, env.RIOT_API_KEY);
    if (g) {
      live = {
        startedAt: Date.now() - g.gameLengthSec * 1000,
        queue: leagueQueue(g.queueId),
        championId: g.championId,
      };
    }
  } catch {
    live = null;
  }
  await env.CACHE.put(key, JSON.stringify(live), { expirationTtl: 60 });
  return live;
}

const PROVIDER = "riot";
const GAME = "league";

function getProvider(db: Database, userId: string) {
  return db
    .select()
    .from(gamingProviders)
    .where(
      and(
        eq(gamingProviders.userId, userId),
        eq(gamingProviders.provider, PROVIDER),
        eq(gamingProviders.game, GAME),
      ),
    )
    .get();
}

/** Map a Riot API error to a clean envelope. */
function riotFail(c: Context<AppEnv>, err: unknown) {
  if (err instanceof RiotError) {
    if (err.status === 404) return fail(c, "riot_not_found", "Riot account not found.", 404);
    if (err.status === 401) return fail(c, "riot_auth", "Riot API key invalid or expired.", 502);
    if (err.status === 403) return fail(c, "riot_forbidden", `Riot API forbidden: ${err.message}`, 502);
    if (err.status === 429) return fail(c, "riot_rate_limit", "Riot API rate limit hit.", 429);
    return fail(c, "riot_error", err.message, 502);
  }
  throw err;
}

async function buildGaming(
  env: Bindings,
  db: Database,
  ref: ProviderRef,
  opts: { live?: boolean } = {},
): Promise<GamingData> {
  const userId = ref.userId;
  const rankRows = await db
    .select()
    .from(gamingSnapshots)
    .where(and(eq(gamingSnapshots.userId, userId), eq(gamingSnapshots.kind, "rank")))
    .orderBy(desc(gamingSnapshots.capturedAt))
    .all();

  const ranks: RankInfo[] = [];
  for (const queueType of ["solo", "flex"] as const) {
    const latest = rankRows.find((r) => r.queueType === queueType);
    if (latest) {
      ranks.push({
        queueType,
        tier: latest.tier ?? "",
        division: latest.division ?? "",
        leaguePoints: latest.leaguePoints ?? 0,
        wins: latest.wins ?? 0,
        losses: latest.losses ?? 0,
      });
    }
  }

  const matchRows = await db
    .select()
    .from(gamingSnapshots)
    .where(and(eq(gamingSnapshots.userId, userId), eq(gamingSnapshots.kind, "match")))
    .orderBy(desc(gamingSnapshots.capturedAt))
    .all();

  const matches: MatchSummary[] = matchRows.slice(0, 20).map((r) => ({
    matchId: r.matchId ?? "",
    champion: r.champion ?? "",
    position: r.position ?? "",
    queue: leagueQueue(r.queueId ?? 0),
    win: r.win === 1,
    kills: r.kills ?? 0,
    deaths: r.deaths ?? 0,
    assists: r.assists ?? 0,
    cs: r.cs ?? 0,
    durationSec: r.durationSec ?? 0,
    score: r.score ?? 0,
    playedAt: r.capturedAt,
  }));

  const winRate = (days: number): number | null => {
    const inWindow = matchRows.filter((r) => isWithinDays(r.capturedAt, days));
    if (inWindow.length === 0) return null;
    return inWindow.filter((r) => r.win === 1).length / inWindow.length;
  };

  return {
    connected: true,
    riotId: ref.riotId,
    region: ref.region,
    ranks,
    matches,
    winRate7d: winRate(7),
    winRate30d: winRate(30),
    live: opts.live === false ? null : await getLive(env, ref),
  };
}

export const gaming = new Hono<AppEnv>()
  // GET /gaming — connected status + rank, matches, win-rate windows.
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const provider = await getProvider(db, userId);
    if (!provider) return ok(c, { connected: false });
    return ok(
      c,
      await buildGaming(
        c.env,
        db,
        {
          userId,
          riotId: provider.riotId ?? "",
          region: provider.region ?? "",
          puuid: provider.puuid ?? "",
        },
        { live: !c.get("isDemo") },
      ),
    );
  })

  // POST /gaming/connect — link a Riot account and backfill recent matches.
  .post("/connect", async (c) => {
    const body = await c.req.json<GamingConnectInput>().catch(() => null);
    if (!body || typeof body.riotId !== "string" || !body.riotId.includes("#") || !body.region) {
      return fail(c, "bad_request", "riotId ('Name#Tag') and region are required.", 400);
    }

    const hash = body.riotId.lastIndexOf("#");
    const gameName = body.riotId.slice(0, hash).trim();
    const tagLine = body.riotId.slice(hash + 1).trim();
    if (!gameName || !tagLine) return fail(c, "bad_request", "Invalid Riot ID.", 400);

    let region;
    try {
      region = resolveRegion(body.region);
    } catch {
      return fail(c, "bad_request", `Unsupported region '${body.region}'.`, 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");

    // Connect backfills ~21 Riot calls — gate per-user and against the global key cap.
    const u = await allowUserDaily(c.env, userId, "gaming-connect");
    const g = await allowGlobalDaily(c.env, "riot");
    if (!u.allowed || !g.allowed) {
      return fail(c, "rate_limited", "Connect limit reached. Try again tomorrow.", 429);
    }

    try {
      const account = await getAccountByRiotId(gameName, tagLine, region.account, c.env.RIOT_API_KEY);

      await db
        .insert(gamingProviders)
        .values({
          id: newId(),
          userId,
          provider: PROVIDER,
          game: GAME,
          riotId: `${account.gameName}#${account.tagLine}`,
          region: region.platform,
          puuid: account.puuid,
          createdAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [gamingProviders.userId, gamingProviders.provider, gamingProviders.game],
          set: {
            riotId: `${account.gameName}#${account.tagLine}`,
            region: region.platform,
            puuid: account.puuid,
          },
        });

      await refreshRiot(
        db,
        c.env,
        { userId, game: GAME, region: region.platform, puuid: account.puuid },
        { force: true, backfill: true },
      );

      return ok(
        c,
        await buildGaming(c.env, db, {
          userId,
          riotId: `${account.gameName}#${account.tagLine}`,
          region: region.platform,
          puuid: account.puuid,
        }),
        201,
      );
    } catch (err) {
      return riotFail(c, err);
    }
  })

  // POST /gaming/refresh — manual refresh (15-minute KV gate).
  .post("/refresh", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const provider = await getProvider(db, userId);
    if (!provider || !provider.puuid || !provider.region) {
      return fail(c, "not_connected", "No Riot account connected.", 400);
    }

    const u = await allowUserDaily(c.env, userId, "gaming-refresh");
    const g = await allowGlobalDaily(c.env, "riot");
    if (!u.allowed || !g.allowed) {
      return fail(c, "rate_limited", "Refresh limit reached. Try later.", 429);
    }

    try {
      const result = await refreshRiot(db, c.env, {
        userId,
        game: GAME,
        region: provider.region,
        puuid: provider.puuid,
      });
      const data = await buildGaming(c.env, db, {
        userId,
        riotId: provider.riotId ?? "",
        region: provider.region,
        puuid: provider.puuid,
      });
      return ok(c, { ...data, refresh: result });
    } catch (err) {
      return riotFail(c, err);
    }
  });
