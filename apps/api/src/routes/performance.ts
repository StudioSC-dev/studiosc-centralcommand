import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import {
  dayKey,
  nutritionSubScore,
  performanceScore,
  sleepSubScore,
} from "@central-command/utils";
import { nutritionLogs, performanceScores, sleepLogs } from "@central-command/db";
import type { PerformanceHistoryPoint } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { newId } from "../lib/ids";

const HRV_NEUTRAL = 50;
const HISTORY_DAYS = 14;

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** GET /performance — today's score (sleep/nutrition/HRV) + recent history. */
export const performance = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const today = dayKey();

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const start = dayStart.getTime();
  const end = start + 24 * 60 * 60 * 1000;

  // Today's sleep (matched by attributed date) and nutrition (by logged time).
  const sleepRows = await db
    .select()
    .from(sleepLogs)
    .where(and(eq(sleepLogs.userId, userId), eq(sleepLogs.date, today)))
    .all();
  const nutritionRows = await db
    .select()
    .from(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, userId),
        gte(nutritionLogs.loggedAt, start),
        lt(nutritionLogs.loggedAt, end),
      ),
    )
    .all();

  const hasSleep = sleepRows.length > 0;
  const hasNutrition = nutritionRows.length > 0;

  const totalSleepMin = sum(sleepRows.map((r) => r.durationMin ?? 0));
  const qualities = sleepRows.map((r) => r.quality).filter((q): q is number => q != null);
  const avgQuality = qualities.length ? sum(qualities) / qualities.length : undefined;

  const totalKcal = sum(nutritionRows.map((r) => r.calories ?? 0));
  const proteins = nutritionRows.map((r) => r.protein).filter((p): p is number => p != null);
  const totalProtein = proteins.length ? sum(proteins) : undefined;

  // A component with no data is neutral (50), like the HRV default.
  const sleep = hasSleep ? sleepSubScore(totalSleepMin, avgQuality) : HRV_NEUTRAL;
  const nutrition = hasNutrition ? nutritionSubScore(totalKcal, totalProtein) : HRV_NEUTRAL;
  const hrv = HRV_NEUTRAL;
  const score = performanceScore({ sleep, nutrition, hrv });
  const hasData = hasSleep || hasNutrition;

  // Persist one row per day (only when there's real data to record).
  if (hasData) {
    const now = Date.now();
    await db
      .insert(performanceScores)
      .values({
        id: newId(),
        userId,
        date: today,
        score,
        sleepScore: sleep,
        nutritionScore: nutrition,
        hrvScore: hrv,
        scoredAt: now,
      })
      .onConflictDoUpdate({
        target: [performanceScores.userId, performanceScores.date],
        set: { score, sleepScore: sleep, nutritionScore: nutrition, hrvScore: hrv, scoredAt: now },
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

  return ok(c, {
    today: { date: today, score, breakdown: { sleep, nutrition, hrv }, hasData },
    history,
  });
});
