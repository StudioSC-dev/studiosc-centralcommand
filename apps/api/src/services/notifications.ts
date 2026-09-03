import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { notificationSources, notifications } from "@central-command/db";
import { sanitiseTags, sanitiseText } from "@central-command/utils";
import type {
  Notification,
  NotificationSourceSummary,
  NotificationStatus,
  NotificationsResponse,
} from "@central-command/types";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

/**
 * The notifications spine — one table, every source.
 *
 * The homelab's ntfy bus is the first producer; Gmail and Slack follow, and the
 * delivery channels (this card today, web push and native toasts later) all read
 * the same rows. A table per source would make each new source a migration and
 * each new delivery channel a fan-in query over N tables.
 *
 * Two shapes live here and they are genuinely different (see 0018's comments):
 * a **feed** source writes rows, a **count-only** source writes a number to
 * `notification_sources.unread_count`. The read path COALESCEs the two so the
 * card renders one badge per source without knowing which kind it is.
 */

/** Field caps, applied at ingest. Over-cap values are truncated, never rejected. */
export const NOTIFICATION_TITLE_MAX = 200;
export const NOTIFICATION_BODY_MAX = 2000;
export const NOTIFICATION_TAGS_MAX = 10;
export const NOTIFICATION_TAG_MAX = 40;
/** One batch may not exceed this many events. */
export const NOTIFICATION_BATCH_MAX = 100;
/** How many feed rows the card read returns. */
const FEED_LIMIT = 50;

type NotificationRow = typeof notifications.$inferSelect;

/** One event as a producer hands it over, before it becomes a row. */
export interface NotificationInput {
  source: string;
  kind?: string;
  /** The producer's own id — an ntfy message id for the lab. Drives dedup. */
  externalId?: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  priority?: number;
  tags?: unknown;
  publishedAt: number;
}

/**
 * Row → wire. Tolerant on the way out: `tags` is JSON written by an earlier
 * version of this code or by a source that has since changed shape, and a
 * malformed blob should cost that one field, not the whole card.
 */
export function toNotification(row: NotificationRow): Notification {
  let tags: string[] = [];
  if (row.tags) {
    try {
      const parsed: unknown = JSON.parse(row.tags);
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      // Leave it empty. History must not be able to break a dashboard.
    }
  }

  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    priority: row.priority,
    tags,
    publishedAt: row.publishedAt,
    status: row.status as NotificationStatus,
  };
}

/**
 * Append events to the spine, idempotently.
 *
 * **Insert-or-ignore on `(user_id, source, external_id)`.** ntfy delivery is
 * at-least-once across reconnects — the agent resumes with `since=<last id>` and
 * will legitimately re-send events it already sent — so the consumer dedupes
 * rather than trusting the stream. Returns the split so the agent can log its
 * own replay behaviour and notice if it is looping.
 *
 * Everything is sanitised and capped here rather than at the route, because this
 * is the choke point every producer goes through: a collector added later gets
 * the same treatment without anyone remembering to ask for it.
 */
export async function appendNotifications(
  db: Database,
  userId: string,
  label: string,
  inputs: readonly NotificationInput[],
): Promise<{ accepted: number; duplicates: number }> {
  if (inputs.length === 0) return { accepted: 0, duplicates: 0 };

  const now = Date.now();
  const rows = inputs.map((input) => ({
    id: newId(),
    userId,
    source: input.source,
    kind: sanitiseText(input.kind ?? "alert", 40) || "alert",
    externalId: input.externalId ? sanitiseText(input.externalId, 128) : null,
    title: sanitiseText(input.title, NOTIFICATION_TITLE_MAX) || "(untitled)",
    body: input.body ? sanitiseText(input.body, NOTIFICATION_BODY_MAX) : null,
    link: input.link ? sanitiseText(input.link, 500) : null,
    // Clamped rather than validated: an out-of-range priority is a producer
    // quirk, and refusing the alert over it would be the wrong trade.
    priority: Math.min(5, Math.max(1, Math.round(input.priority ?? 3))),
    tags: JSON.stringify(sanitiseTags(input.tags, NOTIFICATION_TAGS_MAX, NOTIFICATION_TAG_MAX)),
    publishedAt: input.publishedAt,
    status: "unread" as const,
    snoozeUntil: null,
    readAt: null,
    createdAt: now,
  }));

  let accepted = 0;
  for (const row of rows) {
    const result = await db.insert(notifications).values(row).onConflictDoNothing().returning({
      id: notifications.id,
    });
    if (result.length > 0) accepted += 1;
  }

  const latest = Math.max(...rows.map((row) => row.publishedAt));
  await touchSource(db, userId, rows[0]!.source, label, { lastEventAt: latest });

  return { accepted, duplicates: rows.length - accepted };
}

/**
 * Upsert the per-source row that backs the card's badge.
 *
 * `unreadCount` is deliberately left alone unless a caller passes one: null
 * means "derive from the feed", which is what every feed source wants, and
 * overwriting it with a computed number here would make the column lie for
 * count-only sources later.
 */
export async function touchSource(
  db: Database,
  userId: string,
  source: string,
  label: string,
  fields: { lastEventAt?: number; unreadCount?: number; state?: "ok" | "stale" | "error" } = {},
): Promise<void> {
  const now = Date.now();
  const values = {
    userId,
    source,
    label: sanitiseText(label, 60) || source,
    unreadCount: fields.unreadCount ?? null,
    lastEventAt: fields.lastEventAt ?? null,
    lastSyncAt: now,
    state: fields.state ?? ("ok" as const),
    updatedAt: now,
  };

  await db
    .insert(notificationSources)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationSources.userId, notificationSources.source],
      set: {
        // label is deliberately absent: it is set on insert (when the source
        // first appears) and after that belongs to the user — a rename via
        // settings must not be overwritten by the next producer push.
        lastSyncAt: now,
        state: values.state,
        updatedAt: now,
        ...(fields.lastEventAt !== undefined ? { lastEventAt: fields.lastEventAt } : {}),
        ...(fields.unreadCount !== undefined ? { unreadCount: fields.unreadCount } : {}),
      },
    });
}

/** The card's read: badges, the unread feed, and the number Zero Inbox drives to zero. */
export async function readNotifications(
  db: Database,
  userId: string,
): Promise<NotificationsResponse> {
  const [sourceRows, feedRows, counts] = await Promise.all([
    db.select().from(notificationSources).where(eq(notificationSources.userId, userId)),
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.status, "unread")))
      .orderBy(desc(notifications.publishedAt))
      .limit(FEED_LIMIT),
    db
      .select({ source: notifications.source, n: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.status, "unread")))
      .groupBy(notifications.source),
  ]);

  const derived = new Map(counts.map((row) => [row.source, Number(row.n)]));

  const sources: NotificationSourceSummary[] = sourceRows.map((row) => ({
    source: row.source,
    label: row.label,
    // COALESCE, in that order: a collector-reported count wins, otherwise count
    // the feed. See the 0018 comment for why both exist.
    unread: row.unreadCount ?? derived.get(row.source) ?? 0,
    lastEventAt: row.lastEventAt,
    state: row.state as NotificationSourceSummary["state"],
  }));

  // A source with unread rows but no `notification_sources` row is a producer
  // that wrote to the spine without registering — surface it rather than hiding
  // its notifications behind a missing badge.
  for (const [source, n] of derived) {
    if (!sources.some((s) => s.source === source)) {
      sources.push({ source, label: source, unread: n, lastEventAt: null, state: "ok" });
    }
  }

  sources.sort((a, b) => b.unread - a.unread || a.label.localeCompare(b.label));

  return {
    sources,
    items: feedRows.map(toNotification),
    totalUnread: sources.reduce((sum, source) => sum + source.unread, 0),
  };
}

/** Rename a notification source's display label. */
export async function renameSource(
  db: Database,
  userId: string,
  source: string,
  label: string,
): Promise<boolean> {
  const cleaned = sanitiseText(label, 60);
  if (!cleaned) return false;
  const updated = await db
    .update(notificationSources)
    .set({ label: cleaned, updatedAt: Date.now() })
    .where(and(eq(notificationSources.userId, userId), eq(notificationSources.source, source)))
    .returning({ source: notificationSources.source });
  return updated.length > 0;
}

/** Remove a notification source and all its notifications. */
export async function deleteSource(
  db: Database,
  userId: string,
  source: string,
): Promise<boolean> {
  const deleted = await db
    .delete(notificationSources)
    .where(and(eq(notificationSources.userId, userId), eq(notificationSources.source, source)))
    .returning({ source: notificationSources.source });
  if (deleted.length === 0) return false;

  await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.source, source)));
  return true;
}

/** Recent notifications from one source — the Homelab card's green-state filler. */
export async function recentFromSource(
  db: Database,
  userId: string,
  source: string,
  limit: number,
): Promise<Notification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.source, source)))
    .orderBy(desc(notifications.publishedAt))
    .limit(limit);
  return rows.map(toNotification);
}

/** Mark one notification. Scoped by user, so an id from another account is a no-op. */
export async function setNotificationStatus(
  db: Database,
  userId: string,
  id: string,
  status: NotificationStatus,
  snoozeUntil: number | null,
): Promise<Notification | null> {
  const updated = await db
    .update(notifications)
    .set({
      status,
      snoozeUntil,
      readAt: status === "unread" ? null : Date.now(),
    })
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id)))
    .returning();

  return updated.length > 0 ? toNotification(updated[0]!) : null;
}

/** Mark everything read, optionally for one source only. Returns rows affected. */
export async function markAllRead(
  db: Database,
  userId: string,
  source?: string,
): Promise<number> {
  const where = source
    ? and(
        eq(notifications.userId, userId),
        eq(notifications.status, "unread"),
        eq(notifications.source, source),
      )
    : and(eq(notifications.userId, userId), eq(notifications.status, "unread"));

  const updated = await db
    .update(notifications)
    .set({ status: "read", readAt: Date.now() })
    .where(where)
    .returning({ id: notifications.id });

  return updated.length;
}

/** Retention window for handled notifications. */
export const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Prune handled notifications past the retention window.
 *
 * **Unread rows are never pruned**, whatever their age. A notification nobody
 * has seen disappearing on a timer is the exact failure this card exists to
 * prevent — the count has to be driven to zero by a person, not by a cron.
 */
export async function pruneNotifications(db: Database, now: number): Promise<number> {
  const deleted = await db
    .delete(notifications)
    .where(
      and(
        inArray(notifications.status, ["read", "dismissed"]),
        lt(notifications.publishedAt, now - NOTIFICATION_RETENTION_MS),
      ),
    )
    .returning({ id: notifications.id });
  return deleted.length;
}
