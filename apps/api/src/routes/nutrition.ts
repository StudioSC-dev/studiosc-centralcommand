import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { nutritionLogs } from "@central-command/db";
import type { NutritionLogEntry, NutritionLogInput, NutritionLogUpdate } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";
import { getUserSettings } from "../services/users";
import { persistPerformanceToday } from "../services/performance";

const RECENT_LIMIT = 20;

const optInt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;

type NutritionRow = typeof nutritionLogs.$inferSelect;
const toEntry = (r: NutritionRow): NutritionLogEntry => ({
  id: r.id,
  meal: r.meal ?? undefined,
  calories: r.calories ?? 0,
  protein: r.protein ?? undefined,
  carbs: r.carbs ?? undefined,
  fat: r.fat ?? undefined,
  loggedAt: r.loggedAt,
});

/** Apply an optional numeric field that may be cleared with null. */
const applyOptInt = (patch: Partial<NutritionRow>, key: "protein" | "carbs" | "fat", v: number | null | undefined) => {
  if (v === null) patch[key] = null;
  else if (typeof v === "number" && Number.isFinite(v)) patch[key] = Math.round(v);
};

/** GET /nutrition, POST /nutrition/log — manual nutrition entries (Phase 1). */
export const nutrition = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(nutritionLogs)
      .where(eq(nutritionLogs.userId, c.get("userId")))
      .orderBy(desc(nutritionLogs.loggedAt))
      .limit(RECENT_LIMIT)
      .all();

    return ok(c, { entries: rows.map(toEntry) });
  })
  .post("/log", async (c) => {
    const body = await c.req.json<NutritionLogInput>().catch(() => null);
    if (!body || typeof body.calories !== "number" || body.calories <= 0) {
      return fail(c, "bad_request", "A positive calories value is required.", 400);
    }

    const entry: NutritionLogEntry = {
      id: newId(),
      meal: typeof body.meal === "string" && body.meal.trim() ? body.meal.trim() : undefined,
      calories: Math.round(body.calories),
      protein: optInt(body.protein),
      carbs: optInt(body.carbs),
      fat: optInt(body.fat),
      loggedAt: Date.now(),
    };

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await db.insert(nutritionLogs).values({
      id: entry.id,
      userId,
      meal: entry.meal ?? null,
      calories: entry.calories,
      protein: entry.protein ?? null,
      carbs: entry.carbs ?? null,
      fat: entry.fat ?? null,
      loggedAt: entry.loggedAt,
    });

    // Keep today's performance row current (GET stays read-only).
    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, entry, 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<NutritionLogUpdate>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const existing = await db
      .select()
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
      .get();
    if (!existing) return fail(c, "not_found", "Entry not found.", 404);

    const patch: Partial<NutritionRow> = {};
    if (body.meal === null) patch.meal = null;
    else if (typeof body.meal === "string" && body.meal.trim()) patch.meal = body.meal.trim();
    if (typeof body.calories === "number" && body.calories > 0) patch.calories = Math.round(body.calories);
    applyOptInt(patch, "protein", body.protein);
    applyOptInt(patch, "carbs", body.carbs);
    applyOptInt(patch, "fat", body.fat);

    await db.update(nutritionLogs).set(patch).where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)));

    // Nutrition feeds the performance score — recompute today's row after the edit.
    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, toEntry({ ...existing, ...patch }));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await db.delete(nutritionLogs).where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)));

    const timeZone = (await getUserSettings(db, userId))?.timezone ?? undefined;
    await persistPerformanceToday(db, userId, timeZone);
    return ok(c, { id });
  });
