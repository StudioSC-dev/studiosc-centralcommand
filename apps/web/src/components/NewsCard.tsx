import { useEffect, useState, type ReactNode } from "react";
import type { NewsItem, NewsTopic } from "@central-command/types";
import { useNews } from "../lib/news";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

const TABS: { label: string; topic: NewsTopic | null }[] = [
  { label: "All", topic: null },
  { label: "Basketball", topic: "basketball" },
  { label: "League", topic: "league" },
  { label: "Tech", topic: "tech" },
];

const PER_PAGE = 5;

export function NewsCard() {
  const { data, isPending, isError, error } = useNews();
  const [active, setActive] = useState<NewsTopic | null>(null);
  const [page, setPage] = useState(0);

  // Reset to the first page whenever the tab changes.
  useEffect(() => setPage(0), [active]);

  if (isPending) return <Card>Loading news…</Card>;
  if (isError) return <Card>News unavailable: {error.message}</Card>;

  const items = active ? data.items.filter((i) => i.topic === active) : data.items;
  const pageCount = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const shown = items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

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
        <>
          <ul className="news-list">
            {shown.map((item) => (
              <NewsRow key={item.id} item={item} />
            ))}
          </ul>
          {pageCount > 1 && (
            <div className="news-pager">
              <button
                type="button"
                className="news-pager-btn"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label="Previous headlines"
              >
                ‹
              </button>
              <span className="news-pager-info">
                {current + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="news-pager-btn"
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
                aria-label="More headlines"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const [broken, setBroken] = useState(false);
  const showImage = item.image && !broken;

  return (
    <li className="news-item">
      {showImage ? (
        <img
          className="news-thumb"
          src={item.image ?? ""}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="news-thumb news-thumb-empty" aria-hidden="true">
          {item.source.charAt(0)}
        </div>
      )}
      <div className="news-item-body">
        <a href={item.url} target="_blank" rel="noreferrer" className="news-title">
          {item.title}
        </a>
        <span className="news-meta">
          {item.source} · {fmtDate(item.publishedAt)}
        </span>
      </div>
    </li>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card news-card pillar-news">
      <h2 className="card-title">News</h2>
      <div className="card-body">{children}</div>
    </section>
  );
}
