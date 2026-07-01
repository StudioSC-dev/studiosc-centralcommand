import { Hono } from "hono";
import { busynessScore, dayBounds } from "@central-command/utils";
import type { CalendarData, CalendarEvent } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { fetchUpcomingEvents } from "../services/google-calendar";
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
  const { start, end } = dayBounds((await getUserSettings(db, userId))?.timezone ?? undefined);

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

  const data: CalendarData = {
    connected: true,
    events,
    todayBusyness: todayBusyness(events, start, end),
  };
  await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return ok(c, data);
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
