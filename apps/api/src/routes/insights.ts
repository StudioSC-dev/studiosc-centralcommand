import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { computeInsights } from "../services/insights";

/** GET /insights — rule-based observations from the user's logged data. */
export const insights = new Hono<AppEnv>().get("/", async (c) => {
  const list = await computeInsights(createDb(c.env.DB), c.get("userId"));
  return ok(c, { insights: list });
});
