import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /sleep, POST /sleep/log — manual sleep input (Phase 1). */
export const sleep = new Hono<AppEnv>()
  .get("/", (c) => ok(c, { pillar: "sleep", userId: c.get("userId"), implemented: false }))
  .post("/log", (c) => ok(c, { pillar: "sleep", action: "log", implemented: false }, 201));
