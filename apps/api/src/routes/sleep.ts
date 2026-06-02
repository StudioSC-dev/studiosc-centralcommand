import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { dayKey } from "@central-command/utils";
import { sleepLogs } from "@central-command/db";
import type { SleepLogEntry, SleepLogInput } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";

const RECENT_LIMIT = 20;

/** GET /sleep, POST /sleep/log — manual sleep entries (Phase 1). */
export const sleep = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(sleepLogs)
      .where(eq(sleepLogs.userId, c.get("userId")))
      .orderBy(desc(sleepLogs.loggedAt))
      .limit(RECENT_LIMIT)
      .all();

    const entries: SleepLogEntry[] = rows.map((r) => ({
      id: r.id,
      date: r.date ?? undefined,
      durationMin: r.durationMin ?? 0,
      quality: r.quality ?? undefined,
      loggedAt: r.loggedAt,
    }));
    return ok(c, { entries });
  })
  .post("/log", async (c) => {
    const body = await c.req.json<SleepLogInput>().catch(() => null);
    if (!body || typeof body.durationMin !== "number" || body.durationMin <= 0) {
      return fail(c, "bad_request", "A positive durationMin is required.", 400);
    }

    const entry: SleepLogEntry = {
      id: newId(),
      date: typeof body.date === "string" && body.date.trim() ? body.date.trim() : dayKey(),
      durationMin: Math.round(body.durationMin),
      quality: typeof body.quality === "number" ? body.quality : undefined,
      loggedAt: Date.now(),
    };

    await createDb(c.env.DB).insert(sleepLogs).values({
      id: entry.id,
      userId: c.get("userId"),
      date: entry.date ?? null,
      durationMin: entry.durationMin,
      quality: entry.quality ?? null,
      loggedAt: entry.loggedAt,
    });
    return ok(c, entry, 201);
  });
