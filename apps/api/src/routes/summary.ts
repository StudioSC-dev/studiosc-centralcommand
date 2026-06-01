import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /summary — aggregated cross-pillar snapshot for the dashboard. */
export const summary = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "summary", userId: c.get("userId"), implemented: false }),
);
