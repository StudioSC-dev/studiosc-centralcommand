import { Hono } from "hono";
import { busynessScore, dayBounds } from "@central-command/utils";
import type { CalendarData, CalendarEvent } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { fetchUpcomingEvents } from "../services/google-calendar";
import { getUserSettings } from "../services/users";
import { getGoogleProvider, getValidGoogleAccessToken } from "../services/google-token";

const CACHE_TTL = 5 * 60; // calendar TTL per CLAUDE.md
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Duration-based busyness for the user's local day. Sums the portion of each
 * timed event that falls within today, normalized 0–100. (Workers AI event
 * classification is the Phase 2 refinement.)
 */
function todayBusyness(events: CalendarEvent[], start: number, end: number): number {
  let scheduledMs = 0;
  for (const e of events) {
    if (e.allDay) continue;
    const from = Math.max(e.start, start);
    const to = Math.min(e.end, end);
    if (to > from) scheduledMs += to - from;
  }
  return busynessScore(scheduledMs / MS_PER_HOUR);
}

/** GET /calendar — upcoming events + today's busyness for the user. */
export const calendar = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const provider = await getGoogleProvider(db, userId);
  if (!provider) return ok(c, { connected: false });

  const cacheKey = `calendar:${userId}`;
  const cached = await c.env.CACHE.get<CalendarData>(cacheKey, "json");
  if (cached) return ok(c, cached);

  const accessToken = await getValidGoogleAccessToken(db, c.env, userId);
  const events = await fetchUpcomingEvents(accessToken, 10);

  const { start, end } = dayBounds((await getUserSettings(db, userId))?.timezone ?? undefined);
  const data: CalendarData = {
    connected: true,
    events,
    todayBusyness: todayBusyness(events, start, end),
  };
  await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return ok(c, data);
});
