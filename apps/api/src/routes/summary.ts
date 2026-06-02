import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { dayBounds, isWithinDays } from "@central-command/utils";
import { fitnessLogs, gamingSnapshots, nutritionLogs, sleepLogs } from "@central-command/db";
import type {
  CalendarData,
  NewsItem,
  SummaryData,
  WeatherCurrent,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { getUserSettings } from "../services/users";
import { computePerformanceToday } from "../services/performance";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /summary — a cheap cross-pillar overview. Reads only DB rows and existing
 * KV caches; it never triggers a fresh OpenWeatherMap / Google / Riot fetch, so
 * it's safe to poll. Any pillar without ready data is returned as null.
 */
export const summary = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const settings = await getUserSettings(db, userId);
  const timeZone = settings?.timezone ?? undefined;
  const { start, end, key: today } = dayBounds(timeZone);

  // Performance (computed from logs).
  const perf = await computePerformanceToday(db, userId, timeZone);

  // Weather (cached only).
  let weather: SummaryData["weather"] = null;
  if (settings?.homeLat != null && settings?.homeLon != null) {
    const key = `weather:current:metric:${round(settings.homeLat)}:${round(settings.homeLon)}`;
    const cached = await c.env.CACHE.get<WeatherCurrent>(key, "json");
    if (cached) weather = { temp: cached.temp, units: "metric", description: cached.description };
  }

  // Calendar (cached only).
  let calendar: SummaryData["calendar"] = null;
  const calCached = await c.env.CACHE.get<CalendarData>(`calendar:${userId}`, "json");
  if (calCached?.connected) {
    const next = calCached.events[0];
    if (next) {
      calendar = {
        nextEventTitle: next.title,
        nextEventStart: next.start,
        todayBusyness: calCached.todayBusyness,
      };
    } else {
      calendar = { nextEventTitle: "", nextEventStart: 0, todayBusyness: calCached.todayBusyness };
    }
  }

  // Sleep (today, by attributed date).
  const sleepRows = await db
    .select({ durationMin: sleepLogs.durationMin })
    .from(sleepLogs)
    .where(and(eq(sleepLogs.userId, userId), eq(sleepLogs.date, today)))
    .all();
  const sleepMin = sleepRows.reduce((s, r) => s + (r.durationMin ?? 0), 0);
  const sleep = sleepRows.length ? { durationMin: sleepMin } : null;

  // Nutrition (today's total calories).
  const nutritionRows = await db
    .select({ calories: nutritionLogs.calories })
    .from(nutritionLogs)
    .where(
      and(eq(nutritionLogs.userId, userId), gte(nutritionLogs.loggedAt, start), lt(nutritionLogs.loggedAt, end)),
    )
    .all();
  const nutrition = nutritionRows.length
    ? { calories: nutritionRows.reduce((s, r) => s + (r.calories ?? 0), 0) }
    : null;

  // Fitness (today's sessions + minutes).
  const fitnessRows = await db
    .select({ durationMin: fitnessLogs.durationMin })
    .from(fitnessLogs)
    .where(
      and(eq(fitnessLogs.userId, userId), gte(fitnessLogs.loggedAt, start), lt(fitnessLogs.loggedAt, end)),
    )
    .all();
  const fitness = fitnessRows.length
    ? { sessions: fitnessRows.length, durationMin: fitnessRows.reduce((s, r) => s + (r.durationMin ?? 0), 0) }
    : null;

  // Gaming (latest solo rank + 7d win rate, from stored snapshots).
  let gaming: SummaryData["gaming"] = null;
  const snapshots = await db
    .select()
    .from(gamingSnapshots)
    .where(eq(gamingSnapshots.userId, userId))
    .orderBy(desc(gamingSnapshots.capturedAt))
    .all();
  const solo = snapshots.find((r) => r.kind === "rank" && r.queueType === "solo");
  if (solo) {
    const matches = snapshots.filter((r) => r.kind === "match");
    const recent = matches.filter((r) => isWithinDays(r.capturedAt, 7));
    const winRate7d = recent.length ? recent.filter((r) => r.win === 1).length / recent.length : null;
    gaming = { rank: `${solo.tier ?? ""} ${solo.division ?? ""}`.trim(), winRate7d };
  }

  // News (cached only).
  let news: SummaryData["news"] = null;
  const newsCached = await c.env.CACHE.get<NewsItem[]>("news:all", "json");
  if (newsCached && newsCached.length > 0) {
    news = { title: newsCached[0]!.title, source: newsCached[0]!.source };
  }

  const data: SummaryData = {
    performance: { score: perf.score, hasData: perf.hasData },
    weather,
    calendar,
    sleep,
    nutrition,
    fitness,
    gaming,
    news,
  };
  return ok(c, data);
});
