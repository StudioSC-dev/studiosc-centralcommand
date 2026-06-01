import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /fitness, POST /fitness/log — manual fitness input (Phase 1). */
export const fitness = new Hono<AppEnv>()
  .get("/", (c) => ok(c, { pillar: "fitness", userId: c.get("userId"), implemented: false }))
  .post("/log", (c) => ok(c, { pillar: "fitness", action: "log", implemented: false }, 201));
