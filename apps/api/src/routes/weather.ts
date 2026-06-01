import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ok } from "../lib/response";

/** GET /weather — current conditions + forecast (OpenWeatherMap, KV-cached). */
export const weather = new Hono<AppEnv>().get("/", (c) =>
  ok(c, { pillar: "weather", userId: c.get("userId"), implemented: false }),
);
