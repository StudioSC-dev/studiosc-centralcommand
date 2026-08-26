import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { pruneNotifications } from "../services/notifications";

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
  try {
    const removed = await pruneNotifications(createDb(env.DB), Date.now());
    if (removed > 0) console.log(`[cron] pruned ${removed} handled notifications`);
  } catch (err) {
    // One failing job must not abort the others in the same tick.
    console.error("[cron] notification prune failed:", err);
  }
}
