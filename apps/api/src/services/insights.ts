import { eq } from "drizzle-orm";
import { gamingSnapshots, performanceScores, sleepLogs } from "@central-command/db";
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

  const scored = perfRows
    .filter((p): p is { date: string; score: number } => p.date != null && p.score != null)
    .map((p) => ({ t: Date.parse(p.date), score: p.score }));

  const out: Insight[] = [];

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

  return out.slice(0, 4);
}
