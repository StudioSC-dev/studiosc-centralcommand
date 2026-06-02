import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { fitnessLogs } from "@central-command/db";
import type { FitnessLogEntry, FitnessLogInput } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";

const RECENT_LIMIT = 20;

/** GET /fitness, POST /fitness/log — manual fitness entries (Phase 1). */
export const fitness = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(fitnessLogs)
      .where(eq(fitnessLogs.userId, c.get("userId")))
      .orderBy(desc(fitnessLogs.loggedAt))
      .limit(RECENT_LIMIT)
      .all();

    const entries: FitnessLogEntry[] = rows.map((r) => ({
      id: r.id,
      activity: r.activity ?? "",
      durationMin: r.durationMin ?? 0,
      intensity: r.intensity ?? undefined,
      loggedAt: r.loggedAt,
    }));
    return ok(c, { entries });
  })
  .post("/log", async (c) => {
    const body = await c.req.json<FitnessLogInput>().catch(() => null);
    if (
      !body ||
      typeof body.activity !== "string" ||
      !body.activity.trim() ||
      typeof body.durationMin !== "number" ||
      body.durationMin <= 0
    ) {
      return fail(c, "bad_request", "activity and a positive durationMin are required.", 400);
    }

    const entry: FitnessLogEntry = {
      id: newId(),
      activity: body.activity.trim(),
      durationMin: Math.round(body.durationMin),
      intensity: typeof body.intensity === "number" ? body.intensity : undefined,
      loggedAt: Date.now(),
    };

    await createDb(c.env.DB).insert(fitnessLogs).values({
      id: entry.id,
      userId: c.get("userId"),
      activity: entry.activity,
      durationMin: entry.durationMin,
      intensity: entry.intensity ?? null,
      loggedAt: entry.loggedAt,
    });
    return ok(c, entry, 201);
  });
