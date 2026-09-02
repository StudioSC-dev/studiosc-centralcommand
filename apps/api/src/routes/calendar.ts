import { Hono } from "hono";
import { busynessScore, dayBounds } from "@central-command/utils";
import type { CalendarData, CalendarEvent } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { createCalendarEvent, fetchUpcomingEvents } from "../services/google-calendar";
import { buildMapUrls } from "../services/maps";
import { planTravel } from "../services/travel";
import { getUserSettings } from "../services/users";
import { getGoogleProvider, getValidGoogleAccessToken } from "../services/google-token";
import { GoogleReauthRequiredError } from "../services/google-oauth";
import { demoCalendar } from "../demo/fixtures";
import { allowGlobalDaily, allowUserDaily } from "../services/rate-limit";
import {
  ensureChannel,
  getChannelByChannelId,
  stopAndDeleteChannel,
  webhookAddress,
} from "../services/calendar-channels";

// Calendar cache TTL. With the push webhook driving freshness (it busts this key
// on a real change), the TTL is only a backstop for a missed push — so it's set
// well above the client poll: high enough to keep fresh Google fetches under the
// 120/day per-user cap on a continuously-polling wall display (~96/day worst
// case), low enough to self-heal within 15 min if a push is ever dropped.
const CACHE_TTL = 15 * 60;
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
  // Demo: serve a fixture (no Google call, no KV write).
  if (c.get("isDemo")) return ok(c, demoCalendar());

  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const provider = await getGoogleProvider(db, userId);
  if (!provider) return ok(c, { connected: false });

  const cacheKey = `calendar:${userId}`;
  const cached = await c.env.CACHE.get<CalendarData>(cacheKey, "json");
  if (cached) return ok(c, cached);

  // Fetch from the start of the user's local day so today's already-finished
  // events come back too (the Today card strikes them through), and pull a
  // week-plus worth so the Calendar card's week view has enough to show.
  const settings = await getUserSettings(db, userId);
  const { start, end } = dayBounds(settings?.timezone ?? undefined);

  const u = await allowUserDaily(c.env, userId, "calendar");
  const g = await allowGlobalDaily(c.env, "google");
  if (!u.allowed || !g.allowed) return fail(c, "rate_limited", "Calendar refresh limit reached. Try later.", 429);

  let events: CalendarEvent[];
  try {
    const accessToken = await getValidGoogleAccessToken(db, c.env, userId);
    events = await fetchUpcomingEvents(accessToken, { timeMin: start, maxResults: 20 });
    // Make sure this user has a live push channel (registers on first fetch for
    // accounts connected before push existed; renews a lapsing one). Best-effort,
    // off the response path; no-op in local dev.
    c.executionCtx.waitUntil(ensureChannel(db, userId, accessToken, webhookAddress(c.env)));
  } catch (err) {
    // Expired/revoked credentials are a recoverable, user-actionable state —
    // prompt a reconnect instead of bubbling up to the generic 500 handler.
    if (err instanceof GoogleReauthRequiredError) {
      // Forget the now-orphaned push channel so its pushes stop busting our
      // cache; the provider row stays so the card keeps showing "reconnect".
      c.executionCtx.waitUntil(stopAndDeleteChannel(db, userId).catch(() => {}));
      return ok(c, { connected: false, needsReconnect: true });
    }
    throw err;
  }

  // Map links first — pure string work, no network, no key required for the
  // keyless link half.
  const withMaps = events.map((e) => ({ ...e, ...buildMapUrls(e.location, c.env.GOOGLE_MAPS_EMBED_KEY) }));

  const density = todayBusyness(withMaps, start, end);
  const home =
    settings?.homeLat != null && settings?.homeLon != null
      ? { lat: settings.homeLat, lon: settings.homeLon }
      : null;

  // Travel is best-effort by construction: no key, no home location or an
  // unroutable venue all yield events without `travel`, and the card falls back
  // to a plain countdown rather than showing a departure time we cannot stand
  // behind. It sits inside the cache miss, so its cost is bounded by the same
  // 15-minute TTL as the Google fetch above.
  const plan = await planTravel(db, {
    events: withMaps,
    dayStart: start,
    dayEnd: end,
    density,
    home,
    apiKey: c.env.ORS_API_KEY,
  });

  const data: CalendarData = {
    connected: true,
    events: plan.events,
    todayBusyness: density,
    todayStress: plan.todayStress,
    stressFactors: plan.stressFactors,
  };
  await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return ok(c, data);
}).post("/events", async (c) => {
  if (c.get("isDemo")) return fail(c, "forbidden", "Demo sessions cannot create events.", 403);

  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

  const { title, start: rawStart, end: rawEnd, description, location } = body;
  if (typeof title !== "string" || !title.trim()) {
    return fail(c, "bad_request", "title is required.", 400);
  }
  if (typeof rawStart !== "number" || typeof rawEnd !== "number" || rawEnd <= rawStart) {
    return fail(c, "bad_request", "start/end must be epoch-ms numbers with end > start.", 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const provider = await getGoogleProvider(db, userId);
  if (!provider) return fail(c, "not_found", "Google account not connected.", 404);

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(db, c.env, userId);
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      return ok(c, { created: false, needsReconnect: true });
    }
    throw err;
  }

  try {
    const event = await createCalendarEvent(accessToken, {
      title: title.trim(),
      start: rawStart,
      end: rawEnd,
      description: typeof description === "string" ? description : undefined,
      location: typeof location === "string" ? location : undefined,
    });
    // Bust the cache so the next GET picks up the new event.
    await c.env.CACHE.delete(`calendar:${userId}`);
    return ok(c, { created: true, event });
  } catch (err) {
    // A 403 from Google likely means the token lacks the write scope.
    if (err instanceof Error && err.message.includes("403")) {
      return ok(c, { created: false, needsReconnect: true });
    }
    throw err;
  }
});

/**
 * POST /calendar/notifications — Google Calendar push webhook (PUBLIC: Google
 * calls it unauthenticated). Mounted outside the session guard. Security is the
 * per-channel `token` we set at watch time and Google echoes back; an unknown
 * channel or mismatched token is ignored. On a real change we invalidate the
 * user's cached calendar so their next poll refetches fresh data. Always 200s
 * fast — Google retries non-2xx responses.
 */
export const calendarWebhook = new Hono<AppEnv>().post("/", async (c) => {
  const channelId = c.req.header("X-Goog-Channel-ID");
  const token = c.req.header("X-Goog-Channel-Token");
  const state = c.req.header("X-Goog-Resource-State");
  if (!channelId) return c.body(null, 200);

  const db = createDb(c.env.DB);
  const channel = await getChannelByChannelId(db, channelId);
  // Ignore unknown channels or a token that doesn't match what we registered.
  if (!channel || channel.token !== token) return c.body(null, 200);

  // "sync" is Google's initial handshake (no change yet); "exists" is a real
  // change. Only the latter needs a cache bust.
  if (state === "exists") {
    await c.env.CACHE.delete(`calendar:${channel.userId}`);
  }
  return c.body(null, 200);
});
