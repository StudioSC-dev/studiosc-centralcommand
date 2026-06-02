import { Card } from "./Card";
import { useSummary } from "../lib/summary";

const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const fmtHours = (min: number) => `${(min / 60).toFixed(1)}h`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-stat">
      <span className="summary-stat-label">{label}</span>
      <span className="summary-stat-value">{value}</span>
    </div>
  );
}

export function SummaryCard() {
  const { data, isPending, isError, error } = useSummary();

  if (isPending) return <Card title="Today">Loading…</Card>;
  if (isError) return <Card title="Today">Unavailable: {error.message}</Card>;

  return (
    <Card title="Today">
      <div className="summary-grid">
        {data.performance && (
          <Stat label="Performance" value={`${data.performance.score}/100`} />
        )}
        {data.weather && (
          <Stat label="Weather" value={`${Math.round(data.weather.temp)}° ${data.weather.description}`} />
        )}
        {data.calendar && (
          <Stat
            label="Next event"
            value={data.calendar.nextEventTitle || `busyness ${data.calendar.todayBusyness}`}
          />
        )}
        {data.sleep && <Stat label="Sleep" value={fmtHours(data.sleep.durationMin)} />}
        {data.nutrition && <Stat label="Calories" value={`${data.nutrition.calories} kcal`} />}
        {data.fitness && (
          <Stat label="Fitness" value={`${data.fitness.sessions}× · ${data.fitness.durationMin}m`} />
        )}
        {data.gaming && (
          <Stat label="Rank" value={`${data.gaming.rank} · ${fmtPct(data.gaming.winRate7d)} 7d`} />
        )}
        {data.news && <Stat label="Headline" value={data.news.title} />}
      </div>
    </Card>
  );
}
