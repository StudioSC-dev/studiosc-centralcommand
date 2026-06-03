import { Card } from "./Card";
import { useInsights } from "../lib/insights";

/** Rule-based observations from logged data. (LLM narrative is the Phase 2 upgrade.) */
export function InsightsCard() {
  const { data, isPending, isError, error } = useInsights();

  if (isPending) return <Card title="Insights" pillar="insights">Loading…</Card>;
  if (isError) return <Card title="Insights" pillar="insights">Insights unavailable: {error.message}</Card>;

  if (data.insights.length === 0) {
    return (
      <Card title="Insights" pillar="insights">
        <p className="news-empty">
          Keep logging sleep, nutrition, and games — insights appear as the data builds up.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Insights" pillar="insights">
      <ul className="insight-list">
        {data.insights.map((i) => (
          <li key={i.id} className={`insight tone-${i.tone}`}>
            <span className="insight-title">{i.title}</span>
            <span className="insight-detail">{i.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
