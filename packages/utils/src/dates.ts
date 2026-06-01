/** Current time as epoch milliseconds. */
export function now(): number {
  return Date.now();
}

/**
 * UTC day key (`YYYY-MM-DD`) for an epoch-ms timestamp. Used to bucket logs and
 * snapshots into days for rolling-window aggregation.
 */
export function dayKey(epochMs: number = Date.now()): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** Whether `epochMs` falls within the last `days` days from `from`. */
export function isWithinDays(
  epochMs: number,
  days: number,
  from: number = Date.now(),
): boolean {
  const windowMs = days * 24 * 60 * 60 * 1000;
  return epochMs >= from - windowMs && epochMs <= from;
}
