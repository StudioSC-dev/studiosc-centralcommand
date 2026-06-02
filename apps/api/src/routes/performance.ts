import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { performanceScores } from "@central-command/db";
import type { PerformanceHistoryPoint } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { newId } from "../lib/ids";
import { computePerformanceToday } from "../services/performance";

const HISTORY_DAYS = 14;

/** GET /performance — today's score (sleep/nutrition/HRV) + recent history. */
export const performance = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const today = await computePerformanceToday(db, userId);
  const { score, breakdown, hasData } = today;

  // Persist one row per day (only when there's real data to record).
  if (hasData) {
    const now = Date.now();
    await db
      .insert(performanceScores)
      .values({
        id: newId(),
        userId,
        date: today.date,
        score,
        sleepScore: breakdown.sleep,
        nutritionScore: breakdown.nutrition,
        hrvScore: breakdown.hrv,
        scoredAt: now,
      })
      .onConflictDoUpdate({
        target: [performanceScores.userId, performanceScores.date],
        set: {
          score,
          sleepScore: breakdown.sleep,
          nutritionScore: breakdown.nutrition,
          hrvScore: breakdown.hrv,
          scoredAt: now,
        },
      });
  }

  const historyRows = await db
    .select({ date: performanceScores.date, score: performanceScores.score })
    .from(performanceScores)
    .where(eq(performanceScores.userId, userId))
    .orderBy(desc(performanceScores.date))
    .limit(HISTORY_DAYS)
    .all();

  const history: PerformanceHistoryPoint[] = historyRows
    .filter((r): r is { date: string; score: number } => r.date != null)
    .reverse();

  return ok(c, { today, history });
});
