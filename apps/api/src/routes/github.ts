import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { fetchGitHubActivity } from "../services/github";

const CACHE_TTL = 5 * 60; // 5-minute KV cache

export const github = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");

    const settings = await getUserSettings(db, userId);
    if (!settings?.githubPat) {
      return ok(c, { connected: false, items: [] });
    }

    // KV cache (5-minute TTL)
    const cacheKey = `github:${userId}`;
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) return ok(c, cached);

    let token: string;
    try {
      token = await decryptSecret(settings.githubPat, c.env.TOKEN_ENCRYPTION_KEY);
    } catch {
      return ok(c, { connected: false, items: [] });
    }

    const items = await fetchGitHubActivity(token);
    const data = { connected: true, items };
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return ok(c, data);
  })
  .put("/token", async (c) => {
    const body = await c.req.json<{ token?: unknown }>().catch(() => null);
    if (!body || typeof body.token !== "string" || !body.token.trim()) {
      return fail(c, "bad_request", "token must be a non-empty string.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const encrypted = await encryptSecret(body.token.trim(), c.env.TOKEN_ENCRYPTION_KEY);
    await upsertUserSettings(db, userId, { githubPat: encrypted });

    // Bust any cached data so the next GET fetches with the new token.
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: true });
  })
  .delete("/token", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await upsertUserSettings(db, userId, { githubPat: null });
    await c.env.CACHE.delete(`github:${userId}`);
    return ok(c, { connected: false });
  });
