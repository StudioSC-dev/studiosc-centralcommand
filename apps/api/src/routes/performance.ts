import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /performance — daily performance score and correlations. */
export const performance = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "performance", userId: c.get("userId"), implemented: false }),
);
