import { eq, lt } from "drizzle-orm";
import { calendarChannels } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";
import { randomState } from "./google-oauth";
import { stopChannel, watchCalendar } from "./google-calendar";

/**
 * The push webhook URL, built from the app's public origin. Empty in local dev
 * (APP_ORIGIN unset) → callers skip channel registration.
 */
export function webhookAddress(env: Bindings): string {
  return env.APP_ORIGIN ? `${env.APP_ORIGIN}/api/calendar/notifications` : "";
}

/**
 * Google Calendar push-channel lifecycle (DB + Google orchestration).
 *
 * One channel per user watches their primary calendar; Google POSTs change
 * notifications to our webhook, which invalidates the user's cached calendar.
 * Channels expire (≤7 days) and are renewed by cron before `expiration`.
 */

// Renew a channel once it's within this window of expiring.
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000; // 24h
// Requested channel lifetime (Google caps Calendar channels at ~7 days).
const CHANNEL_TTL_SEC = 7 * 24 * 60 * 60;

export type CalendarChannel = typeof calendarChannels.$inferSelect;

/** The channel matching an inbound push's X-Goog-Channel-ID, or undefined. */
export function getChannelByChannelId(
  db: Database,
  channelId: string,
): Promise<CalendarChannel | undefined> {
  return db
    .select()
    .from(calendarChannels)
    .where(eq(calendarChannels.channelId, channelId))
    .get();
}

/** Channels at or past the renewal window — the cron re-watches these. */
export function getExpiringChannels(db: Database, now = Date.now()): Promise<CalendarChannel[]> {
  return db
    .select()
    .from(calendarChannels)
    .where(lt(calendarChannels.expiration, now + RENEW_BEFORE_MS))
    .all();
}

/**
 * Ensure the user has a live watch channel. No-ops if the current one is still
 * comfortably in-window; otherwise stops any stale channel and opens a fresh
 * one. Best-effort — failures (e.g. an unverified webhook domain, or localhost
 * in dev) are swallowed so calendar reads keep working via polling.
 */
export async function ensureChannel(
  db: Database,
  userId: string,
  accessToken: string,
  address: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  // Google can only reach a public HTTPS webhook; skip in local dev.
  if (!address.startsWith("https://")) return;

  const existing = await db
    .select()
    .from(calendarChannels)
    .where(eq(calendarChannels.userId, userId))
    .get();

  if (!opts.force && existing && existing.expiration > Date.now() + RENEW_BEFORE_MS) {
    return; // still fresh
  }

  try {
    if (existing) {
      await stopChannel(accessToken, {
        channelId: existing.channelId,
        resourceId: existing.resourceId,
      }).catch(() => {}); // stopping the old one must not block opening the new one
    }

    const channelId = newId();
    const token = randomState();
    const { resourceId, expiration } = await watchCalendar(accessToken, {
      channelId,
      token,
      address,
      ttlSec: CHANNEL_TTL_SEC,
    });

    await db
      .insert(calendarChannels)
      .values({ userId, channelId, resourceId, token, expiration, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: calendarChannels.userId,
        set: { channelId, resourceId, token, expiration },
      });
  } catch {
    // Swallow: the domain may not be verified yet, or Google may be down.
    // Calendar still serves via the poll; the next ensure/cron retries.
  }
}

/**
 * Stop and forget the user's channel (on disconnect or dead credentials). Best-
 * effort at Google; the DB row is always removed. Pass a token when available so
 * Google is told to stop pushing.
 */
export async function stopAndDeleteChannel(
  db: Database,
  userId: string,
  accessToken?: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(calendarChannels)
    .where(eq(calendarChannels.userId, userId))
    .get();
  if (!existing) return;

  if (accessToken) {
    await stopChannel(accessToken, {
      channelId: existing.channelId,
      resourceId: existing.resourceId,
    }).catch(() => {});
  }
  await db.delete(calendarChannels).where(eq(calendarChannels.userId, userId));
}
