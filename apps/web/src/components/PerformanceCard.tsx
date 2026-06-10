import { useState } from "react";
import type { PerformanceHistoryPoint, PerformanceHrv, PerformanceRestingHr } from "@central-command/types";
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

/** Resting-HR stat: weekly average with a trend vs the 30-day baseline (lower = better). */
function RestingHrStat({ rhr }: { rhr: PerformanceRestingHr }) {
  const delta = rhr.avg7d != null && rhr.avg30d != null ? rhr.avg7d - rhr.avg30d : null;
  const trend =
    delta == null || delta === 0
      ? { sym: "→", cls: "flat" }
      : delta < 0
        ? { sym: "↓", cls: "good" } // lower RHR than baseline = improving
        : { sym: "↑", cls: "bad" };
  return (
    <div className="perf-vitals">
      <div className="perf-vital">
        <span className="perf-vital-value">{rhr.avg7d != null ? `${rhr.avg7d}` : "—"}</span>
        <span className="perf-vital-unit">bpm</span>
        <span className="perf-vital-label">resting HR · 7-day avg</span>
      </div>
      {delta != null && (
        <span className={`perf-trend ${trend.cls}`} title="vs 30-day average">
          {trend.sym} {Math.abs(delta)} vs 30d
        </span>
      )}
    </div>
  );
}

/** Inline-SVG area/line chart of the daily score history (stretched to fill). */
function ScoreChart({ points }: { points: PerformanceHistoryPoint[] }) {
  const n = points.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (score: number) => 40 - (Math.max(0, Math.min(100, score)) / 100) * 38 - 1;
  const line = points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ");
  const area = `0,40 ${line} 100,40`;

  return (
    <svg className="perf-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="perf-chart-area" points={area} />
      <polyline className="perf-chart-line" points={line} />
    </svg>
  );
}

export function PerformanceCard() {
  const { data, isPending, isError, error } = usePerformance();
  const [window, setWindow] = useState<7 | 30>(30);

  if (isPending) return <Card title="Performance" pillar="perf">Loading…</Card>;
  if (isError) return <Card title="Performance" pillar="perf">Unavailable: {error.message}</Card>;

  const { today, history, restingHr } = data;
  const shown = window === 7 ? history.slice(-7) : history;

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

      <RestingHrStat rhr={restingHr} />

      {shown.length > 1 && (
        <div className="perf-trend-block">
          <div className="perf-trend-head">
            <span className="perf-trend-title">Score trend</span>
            <div className="perf-toggle">
              {([7, 30] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`perf-toggle-btn${window === w ? " active" : ""}`}
                  onClick={() => setWindow(w)}
                >
                  {w}d
                </button>
              ))}
            </div>
          </div>
          <ScoreChart points={shown} />
        </div>
      )}
    </Card>
  );
}
