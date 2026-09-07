import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { fetchLinearNotifications, validateLinearApiKey } from "../services/linear";
import { appendNotifications, deleteSource } from "../services/notifications";
import type { LinearAccount } from "@central-command/types";

const CACHE_TTL = 10 * 60;

interface StoredLinearAccount {
  id: string;
  label: string;
  apiKey: string; // encrypted
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

export const linear = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.linearAccounts ?? null);

    if (accounts.length === 0) {
      return ok(c, { connected: false, accounts: [] });
    }

    const cacheKey = `linear:${userId}`;
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) return ok(c, cached);

    const accountList: LinearAccount[] = [];
    let totalAccepted = 0;

    for (const acct of accounts) {
      let apiKey: string;
      try {
        apiKey = await decryptSecret(acct.apiKey, c.env.TOKEN_ENCRYPTION_KEY);
      } catch {
        continue;
      }
      accountList.push({ id: acct.id, label: acct.label });
      try {
        const inputs = await fetchLinearNotifications(apiKey, acct.label);
        if (inputs.length > 0) {
          const result = await appendNotifications(db, userId, acct.label, inputs);
          totalAccepted += result.accepted;
        }
      } catch {
        // skip failed accounts gracefully
      }
    }

    const data = { connected: true, accounts: accountList, ingested: totalAccepted };
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return ok(c, data);
  })
  .put("/accounts", async (c) => {
    const body = await c.req.json<{ label?: unknown; apiKey?: unknown }>().catch(() => null);
    if (
      !body ||
      typeof body.label !== "string" ||
      !body.label.trim() ||
      typeof body.apiKey !== "string" ||
      !body.apiKey.trim()
    ) {
      return fail(c, "bad_request", "label and apiKey must be non-empty strings.", 400);
    }

    const trimmedKey = body.apiKey.trim();
    const validation = await validateLinearApiKey(trimmedKey);
    if (!validation.valid) {
      return fail(c, "invalid_credentials", "The Linear API key is invalid or expired.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const accounts = parseAccounts(settings?.linearAccounts ?? null);

    const id = crypto.randomUUID().slice(0, 8);
    const encrypted = await encryptSecret(trimmedKey, c.env.TOKEN_ENCRYPTION_KEY);
    accounts.push({ id, label: body.label.trim(), apiKey: encrypted });

    await upsertUserSettings(db, userId, { linearAccounts: JSON.stringify(accounts) });
    await c.env.CACHE.delete(`linear:${userId}`);
    return ok(c, { connected: true, id });
  })
  .delete("/accounts/:id", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const accountId = c.req.param("id");
    const settings = await getUserSettings(db, userId);

    let accounts = parseAccounts(settings?.linearAccounts ?? null);
    accounts = accounts.filter((a) => a.id !== accountId);

    await upsertUserSettings(db, userId, {
      linearAccounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
    });
    await c.env.CACHE.delete(`linear:${userId}`);

    if (accounts.length === 0) {
      await deleteSource(db, userId, "linear");
    }

    return ok(c, { connected: accounts.length > 0 });
  });
