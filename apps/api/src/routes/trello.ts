import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { fetchTrelloNotifications, validateTrelloCredentials } from "../services/trello";
import { appendNotifications, deleteSource } from "../services/notifications";
import type { TrelloAccount } from "@central-command/types";

const CACHE_TTL = 10 * 60;

interface StoredTrelloAccount {
  id: string;
  label: string;
  apiKey: string; // encrypted
  token: string; // encrypted
}

function parseAccounts(raw: string | null): StoredTrelloAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredTrelloAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.apiKey === "string" &&
        typeof a.token === "string",
    );
  } catch {
    return [];
  }
}

export const trello = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.trelloAccounts ?? null);

    if (accounts.length === 0) {
      return ok(c, { connected: false, accounts: [] });
    }

    const cacheKey = `trello:${userId}`;
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) return ok(c, cached);

    const accountList: TrelloAccount[] = [];

    for (const acct of accounts) {
      let apiKey: string;
      let token: string;
      try {
        apiKey = await decryptSecret(acct.apiKey, c.env.TOKEN_ENCRYPTION_KEY);
        token = await decryptSecret(acct.token, c.env.TOKEN_ENCRYPTION_KEY);
      } catch {
        continue;
      }
      accountList.push({ id: acct.id, label: acct.label });
      try {
        const inputs = await fetchTrelloNotifications(apiKey, token, acct.label);
        if (inputs.length > 0) {
          await appendNotifications(db, userId, acct.label, inputs);
        }
      } catch {
        // skip failed accounts gracefully
      }
    }

    const data = { connected: true, accounts: accountList };
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return ok(c, data);
  })
  .put("/accounts", async (c) => {
    const body = await c.req
      .json<{ label?: unknown; apiKey?: unknown; token?: unknown }>()
      .catch(() => null);
    if (
      !body ||
      typeof body.label !== "string" ||
      !body.label.trim() ||
      typeof body.apiKey !== "string" ||
      !body.apiKey.trim() ||
      typeof body.token !== "string" ||
      !body.token.trim()
    ) {
      return fail(c, "bad_request", "label, apiKey, and token must be non-empty strings.", 400);
    }

    const trimmedKey = body.apiKey.trim();
    const trimmedToken = body.token.trim();
    const validation = await validateTrelloCredentials(trimmedKey, trimmedToken);
    if (!validation.valid) {
      return fail(c, "invalid_credentials", "The Trello credentials are invalid.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.trelloAccounts ?? null);

    const id = crypto.randomUUID().slice(0, 8);
    const encApiKey = await encryptSecret(trimmedKey, c.env.TOKEN_ENCRYPTION_KEY);
    const encToken = await encryptSecret(trimmedToken, c.env.TOKEN_ENCRYPTION_KEY);
    accounts.push({ id, label: body.label.trim(), apiKey: encApiKey, token: encToken });

    await upsertUserSettings(db, userId, { trelloAccounts: JSON.stringify(accounts) });
    await c.env.CACHE.delete(`trello:${userId}`);
    return ok(c, { connected: true, id });
  })
  .delete("/accounts/:id", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const accountId = c.req.param("id");
    const settings = await getUserSettings(db, userId);

    let accounts = parseAccounts(settings?.trelloAccounts ?? null);
    accounts = accounts.filter((a) => a.id !== accountId);

    await upsertUserSettings(db, userId, {
      trelloAccounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
    });
    await c.env.CACHE.delete(`trello:${userId}`);

    if (accounts.length === 0) {
      await deleteSource(db, userId, "trello");
    }

    return ok(c, { connected: accounts.length > 0 });
  });
