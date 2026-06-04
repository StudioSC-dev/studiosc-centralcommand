import type { PerformanceHrv } from "@central-command/types";
import { Card } from "./Card";
import { usePerformance } from "../lib/performance";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="perf-bar">
      <span className="perf-bar-label">{label}</span>
      <span className="perf-bar-track">
        <span className="perf-bar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="perf-bar-val">{value}</span>
    </div>
  );
}

/**
 * HRV is captured + displayed but not yet folded into the score (too individual
 * to score from a thin baseline). Show the latest reading + baseline progress
 * instead of a misleading bar value.
 */
function HrvRow({ hrv }: { hrv: PerformanceHrv }) {
  return (
    <div className="perf-bar perf-bar-hrv">
      <span className="perf-bar-label">HRV</span>
      <span className="perf-hrv-note">
        {hrv.latestMs != null ? `${hrv.latestMs}ms today · ` : ""}
        not scored yet — building baseline ({hrv.nights} {hrv.nights === 1 ? "night" : "nights"})
      </span>
    </div>
  );
}

export function PerformanceCard() {
  const { data, isPending, isError, error } = usePerformance();

  if (isPending) return <Card title="Performance" pillar="perf">Loading…</Card>;
  if (isError) return <Card title="Performance" pillar="perf">Unavailable: {error.message}</Card>;

  const { today, history } = data;

  return (
    <Card title="Performance" pillar="perf">
      <div className="perf-head">
        <span className="perf-score">{today.score}</span>
        <span className="perf-out">/100</span>
        {!today.hasData && <span className="perf-note">log sleep/nutrition to refine</span>}
      </div>
      <div className="perf-bars">
        <Bar label="Sleep" value={today.breakdown.sleep} />
        <Bar label="Nutrition" value={today.breakdown.nutrition} />
        <HrvRow hrv={today.hrv} />
      </div>
      {history.length > 1 && (
        <div className="perf-history">
          {history.map((p) => (
            <span
              key={p.date}
              className="perf-spark"
              style={{ height: `${Math.max(4, p.score)}%` }}
              title={`${p.date}: ${p.score}`}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
