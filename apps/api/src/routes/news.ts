import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /news — aggregated RSS feeds (ESPN NBA, Hacker News, TechCrunch, Dot Esports). */
export const news = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "news", userId: c.get("userId"), implemented: false }),
);
