/** Current time as epoch milliseconds. */
export function now(): number {
  return Date.now();
}

/**
 * Day key (`YYYY-MM-DD`) for a timestamp. With a `timeZone` (IANA name) the key
 * is the local calendar day in that zone; without one it falls back to UTC.
 */
export function dayKey(epochMs: number = Date.now(), timeZone?: string): string {
  if (!timeZone) return new Date(epochMs).toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epochMs);
}

/**
 * Offset (ms) such that `localWallTime = utc + offset` for `timeZone` at `at`.
 * Computed from `Intl` parts, so it reflects the zone's actual rules.
 */
function tzOffsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at;
}

/**
 * UTC-ms bounds of the calendar day containing `at`. With a `timeZone` the day
 * is the local day in that zone (so "today" rolls over at local midnight);
 * without one it's the UTC day. `key` is the matching `YYYY-MM-DD`.
 *
 * The offset is sampled at `at`; on DST-transition days the boundary can be off
 * by the transition amount — acceptable for daily aggregates.
 */
export function dayBounds(
  timeZone?: string,
  at: number = Date.now(),
): { start: number; end: number; key: string } {
  const key = dayKey(at, timeZone);
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  const start = timeZone ? utcMidnight - tzOffsetMs(timeZone, at) : utcMidnight;
  return { start, end: start + 24 * 60 * 60 * 1000, key };
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
