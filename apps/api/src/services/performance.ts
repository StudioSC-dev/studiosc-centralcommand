import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { dayBounds, nutritionSubScore, performanceScore, sleepSubScore } from "@central-command/utils";
import { nutritionLogs, performanceScores, sleepLogs } from "@central-command/db";
import type { PerformanceBreakdown, PerformanceHrv } from "@central-command/types";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

const HRV_NEUTRAL = 50;

export interface ComputedPerformance {
  date: string;
  score: number;
  breakdown: PerformanceBreakdown;
  hrv: PerformanceHrv;
  hasData: boolean;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Compute today's performance score from the user's sleep + nutrition logs.
 * Pure (no writes) so both the performance route and the summary can reuse it.
 * "Today" is the user's local day (`timeZone`); a component with no data is
 * neutral (50), like the HRV default.
 */
export async function computePerformanceToday(
  db: Database,
  userId: string,
  timeZone?: string,
): Promise<ComputedPerformance> {
  const { start, end, key } = dayBounds(timeZone);

  const sleepRows = await db
    .select()
    .from(sleepLogs)
    .where(and(eq(sleepLogs.userId, userId), eq(sleepLogs.date, key)))
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

  const sleep = hasSleep ? sleepSubScore(totalSleepMin, avgQuality) : HRV_NEUTRAL;
  const nutrition = hasNutrition ? nutritionSubScore(totalKcal, totalProtein) : HRV_NEUTRAL;
  // HRV stays neutral in the formula this phase (captured + displayed, not scored).
  const hrv = HRV_NEUTRAL;

  // Latest HRV reading attributed to today (most recently logged non-null).
  const latestHrvMs =
    [...sleepRows]
      .filter((r) => r.hrv != null)
      .sort((a, b) => b.loggedAt - a.loggedAt)[0]?.hrv ?? null;

  // Total nights with an HRV reading so far — drives the "building baseline" note.
  const hrvNightRows = await db
    .selectDistinct({ date: sleepLogs.date })
    .from(sleepLogs)
    .where(and(eq(sleepLogs.userId, userId), isNotNull(sleepLogs.hrv)))
    .all();

  return {
    date: key,
    score: performanceScore({ sleep, nutrition, hrv }),
    breakdown: { sleep, nutrition, hrv },
    hrv: { latestMs: latestHrvMs, nights: hrvNightRows.length, scored: false },
    hasData: hasSleep || hasNutrition,
  };
}

/**
 * Compute today's score and upsert the daily `performance_scores` row (one per
 * user per day). Called when a sleep/nutrition log is created so the GET
 * endpoint can stay read-only. No-op when there's no data to record.
 */
export async function persistPerformanceToday(
  db: Database,
  userId: string,
  timeZone?: string,
): Promise<ComputedPerformance> {
  const today = await computePerformanceToday(db, userId, timeZone);
  if (!today.hasData) return today;

  const now = Date.now();
  const { score, breakdown } = today;
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
  return today;
}
