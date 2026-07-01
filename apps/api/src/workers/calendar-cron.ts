import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { GoogleReauthRequiredError } from "../services/google-oauth";
import { getValidGoogleAccessToken } from "../services/google-token";
import {
  ensureChannel,
  getExpiringChannels,
  stopAndDeleteChannel,
  webhookAddress,
} from "../services/calendar-channels";

/**
 * Google Calendar channel renewal — invoked by Cron Triggers (see
 * `wrangler.toml`). Watch channels expire (≤7 days); this re-watches any nearing
 * expiry so push notifications never lapse. Dead credentials (revoked / expired
 * refresh token) drop the channel so the user gets a clean reconnect. One user
 * failing does not abort the others. No-op in local dev (APP_ORIGIN unset).
 */
export async function runCalendarRenewal(env: Bindings): Promise<void> {
  const address = webhookAddress(env);
  if (!address) return; // push disabled (local dev / no public origin)

  const db = createDb(env.DB);
  const expiring = await getExpiringChannels(db);

  for (const ch of expiring) {
    try {
      const accessToken = await getValidGoogleAccessToken(db, env, ch.userId);
      await ensureChannel(db, ch.userId, accessToken, address, { force: true });
    } catch (err) {
      if (err instanceof GoogleReauthRequiredError) {
        // Credential is dead — forget the channel; the calendar card prompts a reconnect.
        await stopAndDeleteChannel(db, ch.userId).catch(() => {});
        continue;
      }
      console.error(`[cron] calendar channel renewal failed for user ${ch.userId}:`, err);
    }
  }
}
