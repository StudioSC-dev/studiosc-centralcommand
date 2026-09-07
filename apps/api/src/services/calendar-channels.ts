import { and, eq, lt } from "drizzle-orm";
import { calendarChannels } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";
import { randomState } from "./google-oauth";
import { stopChannel, watchCalendar } from "./google-calendar";

/**
 * The push webhook URL, built from the app's browser-facing origin. Google only
 * pushes to a public HTTPS endpoint, so a local dev `APP_ORIGIN`
 * (`http://localhost:5173`) yields a non-https address and `ensureChannel`
 * skips registration — the calendar poll keeps data fresh instead.
 */
export function webhookAddress(env: Bindings): string {
  return `${env.APP_ORIGIN.replace(/\/+$/, "")}/api/calendar/notifications`;
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
 * Ensure a live watch channel exists for a (userId, accountId) pair. No-ops if
 * the current one is still comfortably in-window; otherwise stops any stale
 * channel and opens a fresh one. Best-effort — failures are swallowed so
 * calendar reads keep working via polling.
 */
export async function ensureChannel(
  db: Database,
  userId: string,
  accessToken: string,
  address: string,
  opts: { force?: boolean; accountId?: string } = {},
): Promise<void> {
  if (!address.startsWith("https://")) return;

  const accountId = opts.accountId ?? "legacy";

  const existing = await db
    .select()
    .from(calendarChannels)
    .where(
      and(eq(calendarChannels.userId, userId), eq(calendarChannels.accountId, accountId)),
    )
    .get();

  if (!opts.force && existing && existing.expiration > Date.now() + RENEW_BEFORE_MS) {
    return;
  }

  try {
    if (existing) {
      await stopChannel(accessToken, {
        channelId: existing.channelId,
        resourceId: existing.resourceId,
      }).catch(() => {});
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
      .values({ userId, accountId, channelId, resourceId, token, expiration, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: [calendarChannels.userId, calendarChannels.accountId],
        set: { channelId, resourceId, token, expiration },
      });
  } catch {
    // Swallow: the domain may not be verified yet, or Google may be down.
  }
}

/**
 * Stop and forget channels for a user. If `accountId` is given, only that
 * account's channel is removed; otherwise all channels for the user are removed.
 */
export async function stopAndDeleteChannel(
  db: Database,
  userId: string,
  accessToken?: string,
  accountId?: string,
): Promise<void> {
  const where = accountId
    ? and(eq(calendarChannels.userId, userId), eq(calendarChannels.accountId, accountId))
    : eq(calendarChannels.userId, userId);

  const rows = await db.select().from(calendarChannels).where(where).all();
  if (rows.length === 0) return;

  if (accessToken) {
    await Promise.allSettled(
      rows.map((r) =>
        stopChannel(accessToken, { channelId: r.channelId, resourceId: r.resourceId }),
      ),
    );
  }
  await db.delete(calendarChannels).where(where);
}
