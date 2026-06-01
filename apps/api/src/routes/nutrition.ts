import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /nutrition, POST /nutrition/log — manual nutrition input (Phase 1). */
export const nutrition = new Hono<AppEnv>()
  .get("/", (c) => ok(c, { pillar: "nutrition", userId: c.get("userId"), implemented: false }))
  .post("/log", (c) => ok(c, { pillar: "nutrition", action: "log", implemented: false }, 201));
