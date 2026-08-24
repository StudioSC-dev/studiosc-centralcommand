import { useEffect, useState, type ReactNode } from "react";
import type { NewsItem, NewsTopic } from "@central-command/types";
import { useNews } from "../lib/news";
import { useClampList } from "../lib/useClampList";
import { Card as CardShell } from "./Card";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

const TABS: { label: string; topic: NewsTopic | null }[] = [
  { label: "All", topic: null },
  { label: "Basketball", topic: "basketball" },
  { label: "League", topic: "league" },
  { label: "Tech", topic: "tech" },
];

/**
 * A ceiling on rows in the DOM, not on rows shown.
 *
 * The page ends where the tile ends, and `useClampList` decides where that is by
 * measuring. This only stops a very long feed putting hundreds of rows on the
 * page to measure against — the same demotion `MAX_EVENTS` got in 5.2.
 */
const DOM_CEILING = 30;

export function NewsCard() {
  const { data, isPending, isError, error } = useNews();
  const [active, setActive] = useState<NewsTopic | null>(null);
  /**
   * A stack of item offsets, not a page index.
   *
   * Page size is measured, so it changes when the card is resized. A page
   * *index* would then silently point at different headlines — resize a 2×2
   * News card and "page 3" becomes a different three articles. An offset is an
   * item, so it survives a resize: the page you are on keeps starting at the
   * headline it started at, and simply shows more or fewer of them.
   *
   * A stack rather than a number because "back" has to undo the *previous*
   * page's size, which may differ from this one's.
   */
  const [offsets, setOffsets] = useState<number[]>([0]);
  const { ref: listRef, clippedCount } = useClampList<HTMLUListElement>();

  // Reset to the first page whenever the tab changes.
  useEffect(() => setOffsets([0]), [active]);

  if (isPending) return <Card>Loading news…</Card>;
  if (isError) return <Card>News unavailable: {error.message}</Card>;

  const items = active ? data.items.filter((i) => i.topic === active) : data.items;
  const offset = offsets[offsets.length - 1] ?? 0;
  // Render everything from here on (up to the DOM ceiling) and let the clamp
  // hide what does not fit. The rendered set deliberately does not depend on the
  // measured count — that would be a feedback loop.
  const shown = items.slice(offset, offset + DOM_CEILING);
  // At least one: on a tile too short for even a single headline, everything
  // measures as clipped, and a page size of zero would make "next" advance by
  // nothing and strand the reader.
  const fitting = Math.max(1, shown.length - clippedCount);
  const hasPrev = offsets.length > 1;
  const hasNext = offset + fitting < items.length;
  const firstShown = items.length === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + fitting, items.length);

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
          <ul className="news-list" ref={listRef}>
            {shown.map((item) => (
              <NewsRow key={item.id} item={item} />
            ))}
          </ul>
          {(hasPrev || hasNext) && (
            <div className="news-pager">
              <button
                type="button"
                className="news-pager-btn"
                onClick={() => setOffsets((stack) => stack.slice(0, -1))}
                disabled={!hasPrev}
                aria-label="Previous headlines"
              >
                ‹
              </button>
              {/* "1–5 of 23", not "1 / 5". With a measured page size the number
                  of pages is not a fixed quantity, so counting them would be a
                  number that changes when you resize the card. */}
              <span className="news-pager-info">
                {firstShown}–{lastShown} of {items.length}
              </span>
              <button
                type="button"
                className="news-pager-btn"
                onClick={() => setOffsets((stack) => [...stack, offset + fitting])}
                disabled={!hasNext}
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

/** Local alias so every `<Card>` in this file gets the News title and pillar.
 * Delegates to the shared shell — see CardShell's `className` note for why. */
function Card({ children }: { children: ReactNode }) {
  return (
    <CardShell title="News" pillar="news" className="news-card" scrollable>
      {children}
    </CardShell>
  );
}
