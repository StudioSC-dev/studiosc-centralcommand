import { Hono } from "hono";
import type { NewsItem } from "@central-command/types";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";
import { fetchAllNews } from "../services/news";

const CACHE_KEY = "news:all"; // global — news is not user-scoped
const CACHE_TTL = 60 * 60; // 1 hour per CLAUDE.md

/** GET /news — aggregated RSS headlines across all topics. */
export const news = new Hono<AppEnv>().get("/", async (c) => {
  const cached = await c.env.CACHE.get<NewsItem[]>(CACHE_KEY, "json");
  if (cached) return ok(c, { items: cached });

  const items = await fetchAllNews();
  await c.env.CACHE.put(CACHE_KEY, JSON.stringify(items), { expirationTtl: CACHE_TTL });
  return ok(c, { items });
});
