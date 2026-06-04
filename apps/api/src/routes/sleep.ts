import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { dayKey } from "@central-command/utils";
import { sleepLogs } from "@central-command/db";
import type { SleepLogEntry, SleepLogInput, SleepLogUpdate } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";
import { getUserSettings } from "../services/users";
import { persistPerformanceToday } from "../services/performance";

const RECENT_LIMIT = 20;

type SleepRow = typeof sleepLogs.$inferSelect;
const toEntry = (r: SleepRow): SleepLogEntry => ({
  id: r.id,
  date: r.date ?? undefined,
  durationMin: r.durationMin ?? 0,
  quality: r.quality ?? undefined,
  hrv: r.hrv ?? undefined,
  loggedAt: r.loggedAt,
});

/** Validate an HRV reading (ms). Returns the rounded value, or null if invalid/absent. */
const cleanHrv = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 300 ? Math.round(v) : null;

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

    return ok(c, { entries: rows.map(toEntry) });
  })
  .post("/log", async (c) => {
    const body = await c.req.json<SleepLogInput>().catch(() => null);
    if (!body || typeof body.durationMin !== "number" || body.durationMin <= 0) {
      return fail(c, "bad_request", "A positive durationMin is required.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;

    const hrv = cleanHrv(body.hrv);
    const entry: SleepLogEntry = {
      id: newId(),
      date:
        typeof body.date === "string" && body.date.trim()
          ? body.date.trim()
          : dayKey(Date.now(), timeZone),
      durationMin: Math.round(body.durationMin),
      quality: typeof body.quality === "number" ? body.quality : undefined,
      hrv: hrv ?? undefined,
      loggedAt: Date.now(),
    };

    await db.insert(sleepLogs).values({
      id: entry.id,
      userId,
      date: entry.date ?? null,
      durationMin: entry.durationMin,
      quality: entry.quality ?? null,
      hrv,
      loggedAt: entry.loggedAt,
    });

    // Keep today's performance row current (GET stays read-only).
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, entry, 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<SleepLogUpdate>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const existing = await db
      .select()
      .from(sleepLogs)
      .where(and(eq(sleepLogs.id, id), eq(sleepLogs.userId, userId)))
      .get();
    if (!existing) return fail(c, "not_found", "Entry not found.", 404);

    const patch: Partial<SleepRow> = {};
    if (typeof body.date === "string" && body.date.trim()) patch.date = body.date.trim();
    if (typeof body.durationMin === "number" && body.durationMin > 0) patch.durationMin = Math.round(body.durationMin);
    if (body.quality === null) patch.quality = null;
    else if (typeof body.quality === "number") patch.quality = body.quality;
    if (body.hrv === null) patch.hrv = null;
    else if (body.hrv !== undefined) patch.hrv = cleanHrv(body.hrv);

    await db.update(sleepLogs).set(patch).where(and(eq(sleepLogs.id, id), eq(sleepLogs.userId, userId)));

    // Sleep feeds the performance score — recompute today's row after the edit.
    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, toEntry({ ...existing, ...patch }));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await db.delete(sleepLogs).where(and(eq(sleepLogs.id, id), eq(sleepLogs.userId, userId)));

    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, { id });
  });
