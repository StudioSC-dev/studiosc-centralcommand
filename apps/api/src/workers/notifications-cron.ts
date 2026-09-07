import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { pruneNotifications, markStaleSources } from "../services/notifications";

/**
 * Retention for the notifications spine — invoked by Cron Triggers.
 *
 * The lab publishes an event every time anything in the house changes state, so
 * without this the table grows forever for a card that only ever shows the last
 * fifty rows.
 *
 * **Only handled rows are pruned.** An unread notification is never deleted on
 * age, however old: a notification nobody has seen disappearing on a timer is
 * the exact failure the card exists to prevent, and the count is meant to be
 * driven to zero by a person.
 */
export async function runNotificationPrune(env: Bindings): Promise<void> {
  const db = createDb(env.DB);
  const now = Date.now();
  try {
    const removed = await pruneNotifications(db, now);
    if (removed > 0) console.log(`[cron] pruned ${removed} handled notifications`);
  } catch (err) {
    console.error("[cron] notification prune failed:", err);
  }
  try {
    const staled = await markStaleSources(db, now);
    if (staled > 0) console.log(`[cron] marked ${staled} notification sources stale`);
  } catch (err) {
    console.error("[cron] stale detection failed:", err);
  }
}
