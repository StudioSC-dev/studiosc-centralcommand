import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { fetchSlackUnreadCount, validateSlackToken } from "../services/slack";
import { touchSource, deleteSource } from "../services/notifications";
import type { SlackAccount } from "@central-command/types";

const CACHE_TTL = 10 * 60;

interface StoredSlackAccount {
  id: string;
  label: string;
  token: string; // encrypted
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

export const slack = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.slackAccounts ?? null);

    if (accounts.length === 0) {
      return ok(c, { connected: false, accounts: [] });
    }

    const cacheKey = `slack:${userId}`;
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) return ok(c, cached);

    const accountList: SlackAccount[] = [];
    let totalUnread = 0;

    for (const acct of accounts) {
      let token: string;
      try {
        token = await decryptSecret(acct.token, c.env.TOKEN_ENCRYPTION_KEY);
      } catch {
        continue;
      }
      accountList.push({ id: acct.id, label: acct.label });
      try {
        const count = await fetchSlackUnreadCount(token);
        totalUnread += count;
        await touchSource(db, userId, "slack", acct.label, {
          unreadCount: count,
          state: "ok",
        });
      } catch {
        // skip failed accounts gracefully
      }
    }

    const data = { connected: true, accounts: accountList, totalUnread };
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return ok(c, data);
  })
  .put("/accounts", async (c) => {
    const body = await c.req.json<{ label?: unknown; token?: unknown }>().catch(() => null);
    if (
      !body ||
      typeof body.label !== "string" ||
      !body.label.trim() ||
      typeof body.token !== "string" ||
      !body.token.trim()
    ) {
      return fail(c, "bad_request", "label and token must be non-empty strings.", 400);
    }

    const trimmedToken = body.token.trim();
    const validation = await validateSlackToken(trimmedToken);
    if (!validation.valid) {
      return fail(c, "invalid_credentials", "The Slack bot token is invalid.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.slackAccounts ?? null);

    const id = crypto.randomUUID().slice(0, 8);
    const encrypted = await encryptSecret(trimmedToken, c.env.TOKEN_ENCRYPTION_KEY);
    accounts.push({ id, label: body.label.trim(), token: encrypted });

    await upsertUserSettings(db, userId, { slackAccounts: JSON.stringify(accounts) });
    await c.env.CACHE.delete(`slack:${userId}`);
    return ok(c, { connected: true, id });
  })
  .delete("/accounts/:id", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const accountId = c.req.param("id");
    const settings = await getUserSettings(db, userId);

    let accounts = parseAccounts(settings?.slackAccounts ?? null);
    accounts = accounts.filter((a) => a.id !== accountId);

    await upsertUserSettings(db, userId, {
      slackAccounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
    });
    await c.env.CACHE.delete(`slack:${userId}`);

    if (accounts.length === 0) {
      await deleteSource(db, userId, "slack");
    }

    return ok(c, { connected: accounts.length > 0 });
  });
