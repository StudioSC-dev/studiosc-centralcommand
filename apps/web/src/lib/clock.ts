import { useEffect, useState } from "react";

/**
 * Live "now" — re-renders on an interval so clocks and relative times stay current.
 * Defaults to a 1s tick; pass a coarser interval (e.g. 60_000) when seconds don't matter.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
