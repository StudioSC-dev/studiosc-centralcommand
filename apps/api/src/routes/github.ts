import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { fetchGitHubActivity } from "../services/github";
import type { GitHubAccount, GitHubActivityItem } from "@central-command/types";

const CACHE_TTL = 5 * 60; // 5-minute KV cache

interface StoredAccount {
  id: string;
  label: string;
  pat: string; // encrypted
}

function parseAccounts(raw: string | null): StoredAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.pat === "string",
    );
  } catch {
    return [];
  }
}

export const github = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);

    // Resolve accounts: prefer multi-account column, fall back to legacy single PAT
    let accounts = parseAccounts(settings?.githubAccounts ?? null);
    if (accounts.length === 0 && settings?.githubPat) {
      accounts = [{ id: "legacy", label: "GitHub", pat: settings.githubPat }];
    }

    if (accounts.length === 0) {
      return ok(c, { connected: false, items: [], accounts: [] });
    }

    // KV cache
    const cacheKey = `github:${userId}`;
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) return ok(c, cached);

    const allItems: GitHubActivityItem[] = [];
    const accountList: GitHubAccount[] = [];

    for (const acct of accounts) {
      let token: string;
      try {
        token = await decryptSecret(acct.pat, c.env.TOKEN_ENCRYPTION_KEY);
      } catch {
        continue;
      }
      accountList.push({ id: acct.id, label: acct.label });
      try {
        const items = await fetchGitHubActivity(token, acct.label);
        allItems.push(...items);
      } catch {
        // Skip failed accounts gracefully
      }
    }

    allItems.sort((a, b) => b.at - a.at);
    const data = {
      connected: true,
      items: allItems.slice(0, 30),
      accounts: accountList,
    };
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return ok(c, data);
  })
  // Multi-account: add or update an account
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

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);

    let accounts = parseAccounts(settings?.githubAccounts ?? null);

    // Migrate legacy single PAT into the accounts array
    if (accounts.length === 0 && settings?.githubPat) {
      accounts = [{ id: "legacy", label: "GitHub", pat: settings.githubPat }];
    }

    const id = crypto.randomUUID().slice(0, 8);
    const encrypted = await encryptSecret(body.token.trim(), c.env.TOKEN_ENCRYPTION_KEY);
    accounts.push({ id, label: body.label.trim(), pat: encrypted });

    await upsertUserSettings(db, userId, {
      githubAccounts: JSON.stringify(accounts),
      githubPat: null, // clear legacy column
    });
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: true, id });
  })
  // Multi-account: remove one account
  .delete("/accounts/:id", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const accountId = c.req.param("id");
    const settings = await getUserSettings(db, userId);

    let accounts = parseAccounts(settings?.githubAccounts ?? null);
    if (accounts.length === 0 && settings?.githubPat) {
      accounts = [{ id: "legacy", label: "GitHub", pat: settings.githubPat }];
    }

    accounts = accounts.filter((a) => a.id !== accountId);

    await upsertUserSettings(db, userId, {
      githubAccounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
      githubPat: null,
    });
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: accounts.length > 0 });
  })
  // Legacy: single-account add (backward compat)
  .put("/token", async (c) => {
    const body = await c.req.json<{ token?: unknown }>().catch(() => null);
    if (!body || typeof body.token !== "string" || !body.token.trim()) {
      return fail(c, "bad_request", "token must be a non-empty string.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const encrypted = await encryptSecret(body.token.trim(), c.env.TOKEN_ENCRYPTION_KEY);

    let accounts = parseAccounts(
      (await getUserSettings(db, userId))?.githubAccounts ?? null,
    );

    if (accounts.length === 0) {
      accounts = [{ id: crypto.randomUUID().slice(0, 8), label: "GitHub", pat: encrypted }];
    } else {
      accounts[0] = { ...accounts[0]!, pat: encrypted };
    }

    await upsertUserSettings(db, userId, {
      githubAccounts: JSON.stringify(accounts),
      githubPat: null,
    });
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: true });
  })
  // Legacy: remove all (backward compat)
  .delete("/token", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await upsertUserSettings(db, userId, { githubPat: null, githubAccounts: null });
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: false });
  });
