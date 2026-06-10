import type { Bindings } from "../env";

/**
 * KV-backed rate limiting. Two axes:
 *   - per-user daily counters (fair use per account)
 *   - global daily caps per third-party API (a circuit breaker that protects the
 *     shared free-tier keys — OpenWeatherMap's 1k/day, the Riot key, etc.)
 *
 * KV is eventually consistent, so counts are approximate — this is a safety
 * ceiling, not billing. Atomic limiting (Durable Objects) is a Phase-2 option.
 */

const TTL_SEC = 60 * 60 * 48; // keep counters ~2 days so the daily key rolls cleanly

/** Daily limits, centralized. */
export const LIMITS = {
  // Per-user (bucket → max/day)
  user: {
    requests: 2000, // coarse backstop across all guarded routes
    weather: 60, // fresh OWM fetches (cache is shared by location, so this is rarely hit)
    geocode: 40, // city search / reverse lookups
    calendar: 120, // fresh Google Calendar fetches
    "gaming-connect": 3, // each connect backfills ~21 Riot calls
    "gaming-refresh": 24,
  },
  // Global per-API (api → max ops/day). Weather op = 2 OWM calls; keep < 1000.
  global: {
    owm: 450,
    "owm-geo": 400,
    riot: 400,
    google: 2000,
  },
} as const;

export type UserBucket = keyof typeof LIMITS.user;
export type GlobalApi = keyof typeof LIMITS.global;

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

/** Today's date stamp (UTC, YYYYMMDD) for the rolling daily window. */
function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Increment the counter at `key` and report whether it's within `limit`. Once
 * the limit is reached we stop incrementing (so a blocked caller can't grow the
 * counter unbounded) and report not-allowed.
 */
async function bump(env: Bindings, key: string, limit: number): Promise<RateResult> {
  const current = Number(await env.CACHE.get(key)) || 0;
  if (current >= limit) return { allowed: false, remaining: 0 };
  await env.CACHE.put(key, String(current + 1), { expirationTtl: TTL_SEC });
  return { allowed: true, remaining: limit - current - 1 };
}

/** Count one operation against a user's daily bucket. */
export function allowUserDaily(env: Bindings, userId: string, bucket: UserBucket): Promise<RateResult> {
  return bump(env, `rl:u:${userId}:${bucket}:${dayStamp()}`, LIMITS.user[bucket]);
}

/** Count one operation against a third-party API's global daily cap. */
export function allowGlobalDaily(env: Bindings, api: GlobalApi): Promise<RateResult> {
  return bump(env, `rl:g:${api}:${dayStamp()}`, LIMITS.global[api]);
}
