import { isNotNull } from "drizzle-orm";
import { userSettings } from "@central-command/db";
import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { decryptSecret } from "../lib/crypto";
import { fetchSlackUnreadCount } from "../services/slack";
import { touchSource } from "../services/notifications";

interface StoredSlackAccount {
  id: string;
  label: string;
  token: string;
}

function parseAccounts(raw: string | null): StoredSlackAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredSlackAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.token === "string",
    );
  } catch {
    return [];
  }
}

const RATE_GATE_TTL = 15 * 60;

export async function runSlackRefresh(env: Bindings): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({
      userId: userSettings.userId,
      slackAccounts: userSettings.slackAccounts,
    })
    .from(userSettings)
    .where(isNotNull(userSettings.slackAccounts))
    .all();

  for (const row of rows) {
    const accounts = parseAccounts(row.slackAccounts);
    if (accounts.length === 0) continue;

    const gateKey = `slack:gate:${row.userId}`;
    const fresh = await env.CACHE.get(gateKey);
    if (fresh) continue;
    await env.CACHE.put(gateKey, String(Date.now()), { expirationTtl: RATE_GATE_TTL });

    for (const acct of accounts) {
      try {
        const token = await decryptSecret(acct.token, env.TOKEN_ENCRYPTION_KEY);
        const count = await fetchSlackUnreadCount(token);
        await touchSource(db, row.userId, "slack", acct.label, {
          unreadCount: count,
          state: "ok",
        });
      } catch (err) {
        console.error(`[cron] slack refresh failed for user ${row.userId}:`, err);
      }
    }
  }
}
