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

// ─── Travel-aware stress ──────────────────────────────────────────────────────

/**
 * Minutes between "I should get moving" and actually being out of the door.
 * A default, not a constant: it is the number most worth tuning after living
 * with the feature, so it is a parameter everywhere below and will become a
 * user setting.
 */
export const DEFAULT_PREP_MINUTES = 10;

/** How a transition between two events feels once travel and prep are removed. */
export type BufferBand = "easy" | "fine" | "tight" | "conflict";

/**
 * Classify the slack before a leg.
 *
 * The bands are the product decision, not the arithmetic: only `conflict` is
 * allowed to spend a row on the Today card, `tight` tints the Next line, and the
 * quieter two are felt only through the score. Everything still contributes —
 * what differs is what earns pixels.
 */
export function bufferBand(bufferMinutes: number): BufferBand {
  if (bufferMinutes < 0) return "conflict";
  if (bufferMinutes <= 10) return "tight";
  if (bufferMinutes <= 30) return "fine";
  return "easy";
}

/** Each band's contribution to the transition term, 0–100. */
const BAND_PRESSURE: Record<BufferBand, number> = {
  easy: 0,
  fine: 35,
  tight: 75,
  conflict: 100,
};

export function bandPressure(band: BufferBand): number {
  return BAND_PRESSURE[band];
}

/**
 * How much of the day is claimed, from the first departure to the last event's
 * end, normalised against a long day.
 *
 * This is the term that catches the day which is not dense and has no tight
 * connections, but still owns you from 7am to 9pm. Density alone reads that as
 * quiet.
 */
export function spanScore(committedHours: number, longDayHours = 12): number {
  if (longDayHours <= 0) return 0;
  return clamp(Math.round((clamp(committedHours, 0, longDayHours) / longDayHours) * 100), 0, 100);
}

/**
 * Today's stress, 0–100.
 *
 * Deliberately *not* a redefinition of `busynessScore`. That function's meaning
 * is published in CLAUDE.md and mirrored into the homelab-telemetry contract, so
 * it stays the duration-based density term and this composes on top of it.
 *
 * `transitions` is the worst pressure of the day rather than the mean: one
 * unmakeable connection is the thing that ruins a day, and averaging it against
 * three comfortable gaps is exactly how it would disappear.
 */
export function stressScore(opts: {
  density: number;
  transitionPressures: readonly number[];
  span: number;
}): number {
  const transitions = opts.transitionPressures.length
    ? Math.max(...opts.transitionPressures)
    : 0;
  const score = opts.density * 0.45 + transitions * 0.4 + opts.span * 0.15;
  return clamp(Math.round(score), 0, 100);
}

/** Wall-clock departure: be there at `start`, minus travel, minus getting ready. */
export function leaveBy(start: number, travelMinutes: number, prepMinutes = DEFAULT_PREP_MINUTES): number {
  return start - (travelMinutes + prepMinutes) * 60_000;
}
