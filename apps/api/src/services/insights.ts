import { eq } from "drizzle-orm";
import {
  fitnessLogs,
  gamingSnapshots,
  performanceScores,
  sleepLogs,
  tasks,
  weatherSnapshots,
} from "@central-command/db";
import type { Insight } from "@central-command/types";
import type { Database } from "../lib/db";

/**
 * Rule-based insights — descriptive + correlational observations computed from
 * the user's own logged data. Zero external calls. Each generator returns an
 * insight only when it has enough data to be meaningful; the LLM-written
 * narrative briefing is the Phase 2 layer on top of these same signals.
 */

const DAY = 24 * 60 * 60 * 1000;
const GOOD_SLEEP_MIN = 7 * 60; // 7 hours

const avg = (ns: number[]) => ns.reduce((s, n) => s + n, 0) / ns.length;
const weekday = (epoch: number) =>
  new Date(epoch).toLocaleDateString("en-US", { weekday: "long" });

export async function computeInsights(db: Database, userId: string): Promise<Insight[]> {
  const now = Date.now();

  const perfRows = await db
    .select({ date: performanceScores.date, score: performanceScores.score })
    .from(performanceScores)
    .where(eq(performanceScores.userId, userId))
    .all();
  const sleepRows = await db
    .select({ date: sleepLogs.date, durationMin: sleepLogs.durationMin })
    .from(sleepLogs)
    .where(eq(sleepLogs.userId, userId))
    .all();
  const gameRows = await db
    .select({ kind: gamingSnapshots.kind, win: gamingSnapshots.win, capturedAt: gamingSnapshots.capturedAt })
    .from(gamingSnapshots)
    .where(eq(gamingSnapshots.userId, userId))
    .all();
  const weatherRows = await db
    .select({ date: weatherSnapshots.date, rain1h: weatherSnapshots.rain1h })
    .from(weatherSnapshots)
    .where(eq(weatherSnapshots.userId, userId))
    .all();
  const fitnessRows = await db
    .select({ activity: fitnessLogs.activity, loggedAt: fitnessLogs.loggedAt })
    .from(fitnessLogs)
    .where(eq(fitnessLogs.userId, userId))
    .all();
  const taskRows = await db
    .select({ priority: tasks.priority, status: tasks.status, completedAt: tasks.completedAt })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .all();

  const scored = perfRows
    .filter((p): p is { date: string; score: number } => p.date != null && p.score != null)
    .map((p) => ({ t: Date.parse(p.date), score: p.score }));

  const out: Insight[] = [];

  // Always-on: today's weather observation. Depends only on a weather snapshot
  // (location set), so there's at least one insight without Google/Riot. First
  // in the list so it survives the cap below.
  const latestSnapshot = [...weatherRows]
    .filter((w) => w.date != null)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string))[0];
  if (latestSnapshot) {
    const wet = latestSnapshot.rain1h != null && latestSnapshot.rain1h > 0;
    out.push({
      id: "weather-today",
      title: wet ? "Rain around today" : "Clear and dry today",
      detail: wet
        ? "Wet conditions — a good day for indoor focus."
        : "Good conditions to get outside and move.",
      tone: wet ? "neutral" : "good",
    });
  }

  // Correlation: sleep duration vs performance, joined by date.
  const perfByDate = new Map(
    perfRows.filter((p) => p.date != null && p.score != null).map((p) => [p.date, p.score as number]),
  );
  const pairs = sleepRows
    .filter((s) => s.date != null && s.durationMin != null && perfByDate.has(s.date))
    .map((s) => ({ min: s.durationMin as number, score: perfByDate.get(s.date as string) as number }));
  const wellRested = pairs.filter((p) => p.min >= GOOD_SLEEP_MIN).map((p) => p.score);
  const shortNights = pairs.filter((p) => p.min < GOOD_SLEEP_MIN).map((p) => p.score);
  if (wellRested.length >= 2 && shortNights.length >= 2) {
    const diff = Math.round(avg(wellRested) - avg(shortNights));
    out.push({
      id: "sleep-vs-perf",
      title: `You perform ${Math.abs(diff)} pts ${diff >= 0 ? "better" : "worse"} on 7+ hrs sleep`,
      detail: `${Math.round(avg(wellRested))} avg after good sleep vs ${Math.round(avg(shortNights))} after short nights.`,
      tone: diff >= 0 ? "good" : "neutral",
    });
  }

  // Trend: performance this week vs the week before.
  const last7 = scored.filter((p) => p.t >= now - 7 * DAY);
  const prev7 = scored.filter((p) => p.t < now - 7 * DAY && p.t >= now - 14 * DAY);
  if (last7.length && prev7.length) {
    const diff = Math.round(avg(last7.map((p) => p.score)) - avg(prev7.map((p) => p.score)));
    out.push({
      id: "perf-wow",
      title: `Performance ${diff >= 0 ? "up" : "down"} ${Math.abs(diff)} pts this week`,
      detail: `Averaging ${Math.round(avg(last7.map((p) => p.score)))} vs ${Math.round(avg(prev7.map((p) => p.score)))} the week before.`,
      tone: diff >= 0 ? "good" : "bad",
    });
  }

  // Correlation: weather (wet vs dry days) vs performance, joined by date.
  const wetScores: number[] = [];
  const dryScores: number[] = [];
  for (const w of weatherRows) {
    if (w.date == null || !perfByDate.has(w.date)) continue;
    const score = perfByDate.get(w.date) as number;
    (w.rain1h != null && w.rain1h > 0 ? wetScores : dryScores).push(score);
  }
  if (wetScores.length >= 2 && dryScores.length >= 2) {
    const diff = Math.round(avg(dryScores) - avg(wetScores));
    out.push({
      id: "weather-vs-perf",
      title: `You perform ${Math.abs(diff)} pts ${diff >= 0 ? "better" : "worse"} on dry days`,
      detail: `${Math.round(avg(dryScores))} avg on clear days vs ${Math.round(avg(wetScores))} on rainy ones.`,
      tone: "neutral",
    });
  }

  // Gaming: recent win rate.
  const recentMatches = gameRows.filter((g) => g.kind === "match" && g.capturedAt >= now - 7 * DAY);
  if (recentMatches.length >= 3) {
    const wins = recentMatches.filter((g) => g.win === 1).length;
    const wr = Math.round((100 * wins) / recentMatches.length);
    out.push({
      id: "gaming-wr",
      title: `${wr}% win rate over ${recentMatches.length} recent games`,
      detail: wr >= 50 ? "Net positive this week — keep it rolling." : "Rough patch — check sleep and breaks.",
      tone: wr >= 50 ? "good" : "neutral",
    });
  }

  // Descriptive: best day this week.
  if (last7.length >= 2) {
    const best = last7.reduce((m, p) => (p.score > m.score ? p : m));
    out.push({
      id: "best-day",
      title: `Best day: ${weekday(best.t)} (${best.score})`,
      detail: "Your highest performance score in the last week.",
      tone: "good",
    });
  }

  // Descriptive: sleep-logging consistency.
  const recentSleepDates = new Set(
    sleepRows.filter((s) => s.date != null && Date.parse(s.date) >= now - 7 * DAY).map((s) => s.date),
  );
  if (sleepRows.length) {
    out.push({
      id: "sleep-consistency",
      title: `Sleep logged ${recentSleepDates.size}/7 nights`,
      detail: recentSleepDates.size >= 5 ? "Great consistency." : "Log nightly for sharper correlations.",
      tone: recentSleepDates.size >= 5 ? "good" : "neutral",
    });
  }

  // Suggestion: it's dry out and you haven't run in a couple of days.
  const latestWeather = [...weatherRows]
    .filter((w) => w.date != null)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
    .at(-1);
  const dryOut = latestWeather != null && (latestWeather.rain1h == null || latestWeather.rain1h === 0);
  const runs = fitnessRows.filter((f) => /run|jog|mile/i.test(f.activity ?? ""));
  const lastRun = runs.length ? Math.max(...runs.map((r) => r.loggedAt)) : 0;
  if (fitnessRows.length > 0 && dryOut && lastRun < now - 2 * DAY) {
    out.push({
      id: "run-suggestion",
      title: "Good day to put in some miles",
      detail: lastRun
        ? "It's dry out and you haven't logged a run in a couple of days."
        : "It's dry out — a good window to get a run in.",
      tone: "neutral",
    });
  }

  // Nudge: lots crossed off today → take a break.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const doneToday = taskRows.filter(
    (t) => t.status === "done" && t.completedAt != null && t.completedAt >= todayStart.getTime(),
  ).length;
  if (doneToday >= 4) {
    out.push({
      id: "tasks-done-today",
      title: `${doneToday} tasks cleared today`,
      detail: "Strong momentum — take a breather before the next push.",
      tone: "good",
    });
  }

  // Focus: several high-priority tasks still open → prioritize.
  const openHigh = taskRows.filter((t) => t.status === "open" && t.priority === "high").length;
  if (openHigh >= 3) {
    out.push({
      id: "prioritize-high",
      title: `${openHigh} high-priority tasks open`,
      detail: "Busy stretch — knock these out first.",
      tone: "neutral",
    });
  }

  return out.slice(0, 6);
}
