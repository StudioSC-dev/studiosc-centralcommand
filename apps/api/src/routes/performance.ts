import { Hono } from "hono";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { performanceScores, sleepLogs } from "@central-command/db";
import type { PerformanceHistoryPoint, PerformanceRestingHr } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { getUserSettings } from "../services/users";
import { computePerformanceToday } from "../services/performance";

const HISTORY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const avg = (ns: number[]): number | null =>
  ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;

/**
 * GET /performance — today's score (sleep/nutrition/HRV) + recent history.
 * Read-only: today's score is computed live, and the daily row is persisted
 * when a sleep/nutrition log is created (see those routes), not here.
 */
export const performance = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const settings = await getUserSettings(db, userId);
  const today = await computePerformanceToday(db, userId, settings?.timezone ?? undefined);

  const historyRows = await db
    .select({ date: performanceScores.date, score: performanceScores.score })
    .from(performanceScores)
    .where(eq(performanceScores.userId, userId))
    .orderBy(desc(performanceScores.date))
    .limit(HISTORY_DAYS)
    .all();

  const history: PerformanceHistoryPoint[] = historyRows
    .filter((r): r is { date: string; score: number } => r.date != null)
    .reverse();

  // Resting-HR summary from the last ~30 nights of sleep logs.
  const hrRows = await db
    .select({ date: sleepLogs.date, restingHr: sleepLogs.restingHr, loggedAt: sleepLogs.loggedAt })
    .from(sleepLogs)
    .where(and(eq(sleepLogs.userId, userId), isNotNull(sleepLogs.restingHr)))
    .orderBy(desc(sleepLogs.loggedAt))
    .limit(60)
    .all();

  const now = Date.now();
  const within = (date: string | null, days: number) =>
    date != null && Date.parse(date) >= now - days * DAY_MS;
  const restingHr: PerformanceRestingHr = {
    latest: hrRows[0]?.restingHr ?? null,
    avg7d: avg(hrRows.filter((r) => within(r.date, 7)).map((r) => r.restingHr as number)),
    avg30d: avg(hrRows.filter((r) => within(r.date, 30)).map((r) => r.restingHr as number)),
  };

  return ok(c, { today, history, restingHr });
});
