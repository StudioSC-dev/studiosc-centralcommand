import { XMLParser } from "fast-xml-parser";
import type { NewsItem, NewsTopic } from "@central-command/types";

/**
 * News aggregation from RSS feeds (no auth, no API keys). All sources are
 * RSS 2.0. Topics: basketball (ESPN NBA), tech (Hacker News, TechCrunch),
 * league (PCGamesN + Dexerto LoL feeds).
 *
 * Dot Esports was dropped — its general feed had drifted to off-topic filler.
 * Both League feeds are LoL-specific and news-focused (verified live).
 */

interface Feed {
  source: string;
  topic: NewsTopic;
  url: string;
}

const FEEDS: Feed[] = [
  { source: "ESPN NBA", topic: "basketball", url: "https://www.espn.com/espn/rss/nba/news" },
  { source: "Hacker News", topic: "tech", url: "https://news.ycombinator.com/rss" },
  { source: "TechCrunch", topic: "tech", url: "https://techcrunch.com/feed/" },
  { source: "PCGamesN", topic: "league", url: "https://www.pcgamesn.com/league-of-legends/feed" },
  { source: "Dexerto", topic: "league", url: "https://www.dexerto.com/league-of-legends/feed/" },
];

/** Max items kept per topic (basketball/tech/league) so a fast-moving feed can't
 * crowd a slower one out of its tab. */
const PER_TOPIC = 12;
/** Max items taken from any single feed (keeps one chatty feed from dominating). */
const PER_FEED = 10;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Decode HTML entities in feed titles. `&amp;` is decoded first to unwrap the
 * double-encoding common in feeds like Hacker News (`&amp;#x27;` → `&#x27;` → `'`).
 */
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, " ");
}

interface RssItem {
  title?: string;
  link?: string | { "@_href"?: string };
  pubDate?: string;
  guid?: string | { "#text"?: string };
}

function linkOf(item: RssItem): string {
  if (typeof item.link === "string") return item.link;
  return item.link?.["@_href"] ?? "";
}

async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "central-command/1.0 (news aggregator)" },
  });
  if (!res.ok) throw new Error(`${feed.source} feed failed: ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const items = toArray(parsed.rss?.channel?.item).slice(0, PER_FEED);

  return items
    .map((item): NewsItem | null => {
      const url = linkOf(item);
      const title = typeof item.title === "string" ? item.title : "";
      if (!url || !title) return null;
      return {
        id: url,
        source: feed.source,
        topic: feed.topic,
        title: decodeEntities(title).trim(),
        url,
        publishedAt: item.pubDate ? Date.parse(item.pubDate) : Date.now(),
      };
    })
    .filter((item): item is NewsItem => item !== null);
}

/**
 * Fetch all feeds in parallel; a failing feed is skipped, not fatal. Items are
 * capped per topic (not globally) so each tab stays populated even when one
 * topic's feeds publish far more often than another's.
 */
export async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const byTopic = new Map<NewsTopic, NewsItem[]>();
  for (const item of all) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }

  const balanced = [...byTopic.values()].flatMap((list) =>
    list.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, PER_TOPIC),
  );
  return balanced.sort((a, b) => b.publishedAt - a.publishedAt);
}
