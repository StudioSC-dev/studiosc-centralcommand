import { useEffect, useState } from "react";

/** Re-render on an interval so time-relative UI (countdowns, "now" markers)
 * stays fresh on an always-on screen. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const isSameLocalDay = (ms: number, ref: number) =>
  new Date(ms).toDateString() === new Date(ref).toDateString();
