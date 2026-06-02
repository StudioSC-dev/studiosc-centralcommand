import type { ReactNode } from "react";
import { useNews } from "../lib/news";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

export function NewsCard() {
  const { data, isPending, isError, error } = useNews();

  if (isPending) return <Card>Loading news…</Card>;
  if (isError) return <Card>News unavailable: {error.message}</Card>;
  if (data.items.length === 0) return <Card>No headlines right now.</Card>;

  return (
    <Card>
      <ul className="news-list">
        {data.items.map((item) => (
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
