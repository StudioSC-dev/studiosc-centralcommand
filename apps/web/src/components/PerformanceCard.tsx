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

export function PerformanceCard() {
  const { data, isPending, isError, error } = usePerformance();

  if (isPending) return <Card title="Performance">Loading…</Card>;
  if (isError) return <Card title="Performance">Unavailable: {error.message}</Card>;

  const { today, history } = data;

  return (
    <Card title="Performance">
      <div className="perf-head">
        <span className="perf-score">{today.score}</span>
        <span className="perf-out">/100</span>
        {!today.hasData && <span className="perf-note">log sleep/nutrition to refine</span>}
      </div>
      <div className="perf-bars">
        <Bar label="Sleep" value={today.breakdown.sleep} />
        <Bar label="Nutrition" value={today.breakdown.nutrition} />
        <Bar label="HRV" value={today.breakdown.hrv} />
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
