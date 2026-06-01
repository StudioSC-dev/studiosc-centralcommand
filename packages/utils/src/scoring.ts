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
