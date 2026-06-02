import type { PerformanceInputs } from "@central-command/types";

/** Clamp a number into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Neutral default for HRV when a reading is not provided. */
export const NEUTRAL_HRV = 50;

/** Weights for the daily performance score. Documented in CLAUDE.md. */
export const PERFORMANCE_WEIGHTS = {
  sleep: 0.4,
  nutrition: 0.35,
  hrv: 0.25,
} as const;

/**
 * Daily performance score.
 *
 *   score = (sleep × 0.40) + (nutrition × 0.35) + (hrv × 0.25)
 *
 * All sub-scores are expected to be on a 0–100 scale. HRV is optional and
 * defaults to a neutral 50. The result is clamped to 0–100.
 */
export function performanceScore(inputs: PerformanceInputs): number {
  const sleep = clamp(inputs.sleep, 0, 100);
  const nutrition = clamp(inputs.nutrition, 0, 100);
  const hrv = clamp(inputs.hrv ?? NEUTRAL_HRV, 0, 100);

  const raw =
    sleep * PERFORMANCE_WEIGHTS.sleep +
    nutrition * PERFORMANCE_WEIGHTS.nutrition +
    hrv * PERFORMANCE_WEIGHTS.hrv;

  return clamp(Math.round(raw), 0, 100);
}

// ─── Sub-scores (manual-log → 0–100), Phase 1 ───────────────────────────────
// Transparent, non-authoritative heuristics with sensible default targets.
// Targets may move to per-user settings when health-data sync lands.

/** Optimal sleep duration in minutes (8h). */
export const SLEEP_OPTIMAL_MIN = 480;
/** Default daily calorie target. */
export const NUTRITION_CALORIE_TARGET = 2000;
/** Default daily protein target (grams). */
export const NUTRITION_PROTEIN_TARGET = 100;

/**
 * Sleep sub-score (0–100) from total minutes slept and optional quality (1–5).
 * Duration peaks at 8h and falls ~1 point per 4 minutes of deviation; when a
 * quality rating is present it contributes 40% of the score.
 */
export function sleepSubScore(totalMin: number, quality?: number): number {
  const duration = clamp(100 - Math.abs(SLEEP_OPTIMAL_MIN - totalMin) / 4, 0, 100);
  if (quality == null) return Math.round(duration);
  const q = clamp((quality / 5) * 100, 0, 100);
  return Math.round(0.6 * duration + 0.4 * q);
}

/**
 * Nutrition sub-score (0–100) from the day's total calories and optional total
 * protein (grams). Calories peak at the target and fall ~1 point per 20 kcal of
 * deviation; protein adequacy (vs target) contributes 40% when logged.
 */
export function nutritionSubScore(totalKcal: number, totalProtein?: number): number {
  const cal = clamp(100 - Math.abs(NUTRITION_CALORIE_TARGET - totalKcal) / 20, 0, 100);
  if (totalProtein == null) return Math.round(cal);
  const protein = clamp((totalProtein / NUTRITION_PROTEIN_TARGET) * 100, 0, 100);
  return Math.round(0.6 * cal + 0.4 * protein);
}

/**
 * Phase 1 calendar busyness score — duration-based.
 *
 * Total scheduled hours for a day, normalized to 0–100 against a "full" day.
 * `fullDayHours` is the number of scheduled hours considered maximally busy
 * (defaults to 10). Phase 2 will replace this with Workers AI classification.
 */
export function busynessScore(scheduledHours: number, fullDayHours = 10): number {
  if (fullDayHours <= 0) return 0;
  const ratio = clamp(scheduledHours, 0, fullDayHours) / fullDayHours;
  return clamp(Math.round(ratio * 100), 0, 100);
}
