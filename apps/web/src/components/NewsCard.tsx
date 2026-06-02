import { useState, type ReactNode } from "react";
import type { NewsTopic } from "@central-command/types";
import { useNews } from "../lib/news";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

/** Tabs filter the already-fetched headlines client-side (no extra requests). */
const TABS: { label: string; topic: NewsTopic | null }[] = [
  { label: "All", topic: null },
  { label: "Basketball", topic: "basketball" },
  { label: "League", topic: "league" },
  { label: "Tech", topic: "tech" },
];

export function NewsCard() {
  const { data, isPending, isError, error } = useNews();
  const [active, setActive] = useState<NewsTopic | null>(null);

  if (isPending) return <Card>Loading news…</Card>;
  if (isError) return <Card>News unavailable: {error.message}</Card>;

  const items = active ? data.items.filter((i) => i.topic === active) : data.items;

  return (
    <Card>
      <div className="news-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={`news-tab${tab.topic === active ? " active" : ""}`}
            onClick={() => setActive(tab.topic)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="news-empty">No headlines here right now.</p>
      ) : (
        <ul className="news-list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer" className="news-title">
                {item.title}
              </a>
              <span className="news-meta">
                {item.source} · {fmtDate(item.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card news-card">
      <h2 className="card-title">News</h2>
      {children}
    </section>
  );
}
