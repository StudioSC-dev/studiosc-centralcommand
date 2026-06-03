import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { fitnessLogs } from "@central-command/db";
import type { FitnessLogEntry, FitnessLogInput, FitnessLogUpdate } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";

const RECENT_LIMIT = 20;

type FitnessRow = typeof fitnessLogs.$inferSelect;
const toEntry = (r: FitnessRow): FitnessLogEntry => ({
  id: r.id,
  activity: r.activity ?? "",
  durationMin: r.durationMin ?? 0,
  intensity: r.intensity ?? undefined,
  loggedAt: r.loggedAt,
});

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

    return ok(c, { entries: rows.map(toEntry) });
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
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<FitnessLogUpdate>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const existing = await db
      .select()
      .from(fitnessLogs)
      .where(and(eq(fitnessLogs.id, id), eq(fitnessLogs.userId, userId)))
      .get();
    if (!existing) return fail(c, "not_found", "Entry not found.", 404);

    const patch: Partial<FitnessRow> = {};
    if (typeof body.activity === "string" && body.activity.trim()) patch.activity = body.activity.trim();
    if (typeof body.durationMin === "number" && body.durationMin > 0) patch.durationMin = Math.round(body.durationMin);
    if (body.intensity === null) patch.intensity = null;
    else if (typeof body.intensity === "number") patch.intensity = body.intensity;

    await db.update(fitnessLogs).set(patch).where(and(eq(fitnessLogs.id, id), eq(fitnessLogs.userId, userId)));
    return ok(c, toEntry({ ...existing, ...patch }));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    await createDb(c.env.DB)
      .delete(fitnessLogs)
      .where(and(eq(fitnessLogs.id, id), eq(fitnessLogs.userId, userId)));
    return ok(c, { id });
  });
