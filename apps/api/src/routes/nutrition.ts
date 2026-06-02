import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { nutritionLogs } from "@central-command/db";
import type { NutritionLogEntry, NutritionLogInput } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";
import { getUserSettings } from "../services/users";
import { persistPerformanceToday } from "../services/performance";

const RECENT_LIMIT = 20;

const optInt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;

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

    const entries: NutritionLogEntry[] = rows.map((r) => ({
      id: r.id,
      meal: r.meal ?? undefined,
      calories: r.calories ?? 0,
      protein: r.protein ?? undefined,
      carbs: r.carbs ?? undefined,
      fat: r.fat ?? undefined,
      loggedAt: r.loggedAt,
    }));
    return ok(c, { entries });
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
  });
