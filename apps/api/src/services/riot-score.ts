import { clamp } from "@central-command/utils";
import type { ParsedMatch } from "./riot";

/**
 * Role-normalized match score (0–100). **Non-authoritative** — a demo metric
 * inspired by OP.GG / dpm.lol, not a reverse-engineering of either.
 *
 * Each stat is expressed as a ratio of actual-to-expected for the player's
 * role, capped at 2×, then weighted. A composite of 1.0 means "met role
 * expectations" and maps to 50; 2.0 (double) maps to 100.
 */
interface RoleBaseline {
  csPerMin: number;
  kda: number;
  visionPerMin: number;
  killParticipation: number;
}

const BASELINES: Record<string, RoleBaseline> = {
  TOP: { csPerMin: 7.0, kda: 2.5, visionPerMin: 0.5, killParticipation: 0.45 },
  JUNGLE: { csPerMin: 5.5, kda: 3.0, visionPerMin: 0.8, killParticipation: 0.6 },
  MIDDLE: { csPerMin: 7.5, kda: 3.0, visionPerMin: 0.5, killParticipation: 0.55 },
  BOTTOM: { csPerMin: 8.0, kda: 3.0, visionPerMin: 0.5, killParticipation: 0.55 },
  UTILITY: { csPerMin: 1.5, kda: 2.5, visionPerMin: 1.6, killParticipation: 0.65 },
};

const DEFAULT_BASELINE: RoleBaseline = {
  csPerMin: 6.0,
  kda: 2.5,
  visionPerMin: 0.7,
  killParticipation: 0.5,
};

const WEIGHTS = { kda: 0.4, cs: 0.25, vision: 0.15, kp: 0.2 };

export function scoreMatch(m: ParsedMatch): number {
  const baseline = BASELINES[m.position] ?? DEFAULT_BASELINE;
  const minutes = Math.max(m.durationSec / 60, 1);

  const kda = (m.kills + m.assists) / Math.max(m.deaths, 1);
  const csPerMin = m.cs / minutes;
  const visionPerMin = m.visionScore / minutes;

  const ratio = (actual: number, expected: number) => clamp(actual / expected, 0, 2);
  const composite =
    WEIGHTS.kda * ratio(kda, baseline.kda) +
    WEIGHTS.cs * ratio(csPerMin, baseline.csPerMin) +
    WEIGHTS.vision * ratio(visionPerMin, baseline.visionPerMin) +
    WEIGHTS.kp * ratio(m.killParticipation, baseline.killParticipation);

  return Math.round(clamp(composite * 50, 0, 100));
}
