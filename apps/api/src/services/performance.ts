import { and, eq, gte, lt } from "drizzle-orm";
import { dayKey, nutritionSubScore, performanceScore, sleepSubScore } from "@central-command/utils";
import { nutritionLogs, sleepLogs } from "@central-command/db";
import type { PerformanceBreakdown } from "@central-command/types";
import type { Database } from "../lib/db";

const HRV_NEUTRAL = 50;

export interface ComputedPerformance {
  date: string;
  score: number;
  breakdown: PerformanceBreakdown;
  hasData: boolean;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Compute today's performance score from the user's sleep + nutrition logs.
 * Pure (no writes) so both the performance route and the summary can reuse it.
 * A component with no data is neutral (50), like the HRV default.
 */
export async function computePerformanceToday(
  db: Database,
  userId: string,
): Promise<ComputedPerformance> {
  const today = dayKey();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const start = dayStart.getTime();
  const end = start + 24 * 60 * 60 * 1000;

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

  const sleep = hasSleep ? sleepSubScore(totalSleepMin, avgQuality) : HRV_NEUTRAL;
  const nutrition = hasNutrition ? nutritionSubScore(totalKcal, totalProtein) : HRV_NEUTRAL;
  const hrv = HRV_NEUTRAL;

  return {
    date: today,
    score: performanceScore({ sleep, nutrition, hrv }),
    breakdown: { sleep, nutrition, hrv },
    hasData: hasSleep || hasNutrition,
  };
}
