import { XMLParser } from "fast-xml-parser";
import type { NewsItem, NewsTopic } from "@central-command/types";

/**
 * News aggregation from RSS feeds (no auth, no API keys). All four sources are
 * RSS 2.0. Per CLAUDE.md: ESPN NBA, Hacker News, TechCrunch, Dot Esports.
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
  // The LoL-category feed was discontinued (301 → HTML page); the general Dot
  // Esports feed is the working RSS source and remains LoL/esports-centric.
  { source: "Dot Esports", topic: "league", url: "https://dotesports.com/feed" },
];

/** Max items returned across all feeds. */
const MAX_ITEMS = 30;
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

/** Fetch all feeds in parallel; a failing feed is skipped, not fatal. */
export async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return items
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ITEMS);
}
