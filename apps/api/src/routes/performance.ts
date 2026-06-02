import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { performanceScores } from "@central-command/db";
import type { PerformanceHistoryPoint } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { getUserSettings } from "../services/users";
import { computePerformanceToday } from "../services/performance";

const HISTORY_DAYS = 14;

/**
 * GET /performance — today's score (sleep/nutrition/HRV) + recent history.
 * Read-only: today's score is computed live, and the daily row is persisted
 * when a sleep/nutrition log is created (see those routes), not here.
 */
export const performance = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const settings = await getUserSettings(db, userId);
  const today = await computePerformanceToday(db, userId, settings?.timezone ?? undefined);

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
