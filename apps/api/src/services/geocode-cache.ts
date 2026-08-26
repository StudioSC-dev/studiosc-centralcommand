import { inArray } from "drizzle-orm";
import { geocodeCache } from "@central-command/db";
import type { Database } from "../lib/db";
import { geocode, type GeocodeResult } from "./openrouteservice";

/**
 * D1-backed cache in front of the ORS geocoder.
 *
 * In D1 rather than KV because a cache miss is a *write*, and KV writes are this
 * project's scarcest resource (~630/day of 1,000 already committed — CLAUDE.md
 * "KV Write Budget"). D1's free tier is 100k writes/day, so this costs the KV
 * budget nothing at all.
 */

/** Successful lookups: places do not move. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Failures: retried daily, not on every calendar refresh. Without a negative
 * cache an unresolvable location — a meeting room, a typo — is re-asked on
 * every cache miss forever, spending the ORS daily quota on a question whose
 * answer is not going to change today.
 */
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cache key. Lowercased and whitespace-collapsed so "Cafe  Mura " and
 * "cafe mura" share one row and one lookup.
 */
export function normaliseQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve many locations at once, reading the cache in one query and asking ORS
 * only for what is missing or stale.
 *
 * Batched deliberately: a day's schedule is resolved as a set, and doing this
 * per-event would issue one D1 round trip per event on a path that already has
 * a latency budget to keep (the calendar response is blocked on it).
 *
 * Returns a map keyed by the *normalised* query. Unresolvable locations are
 * absent from the map and written back as misses.
 */
export async function geocodeMany(
  db: Database,
  texts: readonly string[],
  apiKey: string,
  now: number,
): Promise<Map<string, GeocodeResult>> {
  const queries = [...new Set(texts.map(normaliseQuery))].filter(Boolean);
  const resolved = new Map<string, GeocodeResult>();
  if (queries.length === 0) return resolved;

  const rows = await db
    .select()
    .from(geocodeCache)
    .where(inArray(geocodeCache.query, queries));

  const fresh = new Set<string>();
  for (const row of rows) {
    if (row.staleAfter <= now) continue; // stale: fall through and re-ask
    fresh.add(row.query);
    // A fresh *miss* is still an answer — it keeps this query out of the ORS
    // batch below without putting anything in the result map.
    if (row.resolved === 1 && row.lat !== null && row.lon !== null) {
      resolved.set(row.query, { lat: row.lat, lon: row.lon, label: row.label ?? row.query });
    }
  }

  const misses = queries.filter((q) => !fresh.has(q));
  if (misses.length === 0) return resolved;

  // ORS's free plan allows 40 concurrent requests and a day's schedule is a
  // handful of distinct places, so a plain parallel fan-out is within budget.
  const looked = await Promise.all(misses.map(async (q) => [q, await geocode(q, apiKey)] as const));

  for (const [query, result] of looked) {
    const staleAfter = now + (result ? HIT_TTL_MS : MISS_TTL_MS);
    if (result) resolved.set(query, result);
    // Upsert: a stale row is being refreshed, a brand new one inserted, and the
    // composite of those two is exactly what onConflictDoUpdate expresses.
    await db
      .insert(geocodeCache)
      .values({
        query,
        lat: result?.lat ?? null,
        lon: result?.lon ?? null,
        label: result?.label ?? null,
        resolved: result ? 1 : 0,
        updatedAt: now,
        staleAfter,
      })
      .onConflictDoUpdate({
        target: geocodeCache.query,
        set: {
          lat: result?.lat ?? null,
          lon: result?.lon ?? null,
          label: result?.label ?? null,
          resolved: result ? 1 : 0,
          updatedAt: now,
          staleAfter,
        },
      });
  }

  return resolved;
}
