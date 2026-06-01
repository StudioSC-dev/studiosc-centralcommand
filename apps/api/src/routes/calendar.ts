import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /calendar — upcoming events for the authenticated user. */
export const calendar = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "calendar", userId: c.get("userId"), implemented: false }),
);
