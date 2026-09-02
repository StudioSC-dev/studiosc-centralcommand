import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getTodaySessions, createSession } from "../services/focus";
import { getUserSettings } from "../services/users";
import { dayBounds } from "@central-command/utils";

export const focus = new Hono<AppEnv>()
  .get("/sessions", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const settings = await getUserSettings(db, userId);
    const { start } = dayBounds(settings?.timezone ?? undefined);
    const result = await getTodaySessions(db, userId, start);
    return ok(c, result);
  })
  .post("/sessions", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const startedAt = body.startedAt;
    const duration = body.duration;
    const completed = body.completed;

    if (typeof startedAt !== "number" || startedAt <= 0) {
      return fail(c, "bad_request", "startedAt must be a positive epoch-ms number.", 400);
    }
    if (typeof duration !== "number" || duration <= 0) {
      return fail(c, "bad_request", "duration must be a positive number (seconds).", 400);
    }
    if (typeof completed !== "boolean") {
      return fail(c, "bad_request", "completed must be a boolean.", 400);
    }

    const db = createDb(c.env.DB);
    const session = await createSession(db, c.get("userId"), { startedAt, duration, completed });
    return ok(c, { session });
  });
