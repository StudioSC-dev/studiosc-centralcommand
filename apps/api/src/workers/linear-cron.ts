import { isNotNull } from "drizzle-orm";
import { userSettings } from "@central-command/db";
import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { decryptSecret } from "../lib/crypto";
import { fetchLinearNotifications } from "../services/linear";
import { appendNotifications } from "../services/notifications";
import { dispatchPushToUser } from "../services/push";

interface StoredLinearAccount {
  id: string;
  label: string;
  apiKey: string;
}

function parseAccounts(raw: string | null): StoredLinearAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredLinearAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.apiKey === "string",
    );
  } catch {
    return [];
  }
}

const RATE_GATE_TTL = 15 * 60; // 15 minutes

export async function runLinearRefresh(env: Bindings): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({
      userId: userSettings.userId,
      linearAccounts: userSettings.linearAccounts,
    })
    .from(userSettings)
    .where(isNotNull(userSettings.linearAccounts))
    .all();

  for (const row of rows) {
    const accounts = parseAccounts(row.linearAccounts);
    if (accounts.length === 0) continue;

    const gateKey = `linear:gate:${row.userId}`;
    const fresh = await env.CACHE.get(gateKey);
    if (fresh) continue;
    await env.CACHE.put(gateKey, String(Date.now()), { expirationTtl: RATE_GATE_TTL });

    for (const acct of accounts) {
      try {
        const apiKey = await decryptSecret(acct.apiKey, env.TOKEN_ENCRYPTION_KEY);
        const inputs = await fetchLinearNotifications(apiKey, acct.label);
        if (inputs.length > 0) {
          const result = await appendNotifications(db, row.userId, acct.label, inputs);
          if (result.accepted > 0 && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
            await dispatchPushToUser(db, row.userId, {
              title: `${result.accepted} new Linear notification${result.accepted > 1 ? "s" : ""}`,
              body: inputs[0]!.title,
            }, env as { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string });
          }
        }
      } catch (err) {
        console.error(`[cron] linear refresh failed for user ${row.userId}:`, err);
      }
    }
  }
}
