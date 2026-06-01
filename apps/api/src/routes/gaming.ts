import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /gaming — connected game stats (Phase 1: League of Legends via Riot). */
export const gaming = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "gaming", userId: c.get("userId"), implemented: false }),
);
