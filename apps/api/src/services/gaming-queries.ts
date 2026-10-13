/**
 * Bounded reads of `gaming_snapshots` for `/gaming` and `/summary`.
 *
 * Every statement is index-satisfied (migration 0032): the latest rank per queue
 * is `LIMIT 1` on `gaming_snapshots_rank_idx`, the match payload is `LIMIT 60` on
 * `gaming_snapshots_kind_time_idx`, and the win-rate windows are aggregates that
 * index covers. Before this, both routes read every snapshot the user had ever
 * stored — rank rows accumulate on every refresh — which alone exhausted D1's
 * 5M rows-read/day free cap.
 *
 * DEPENDENCY-FREE ON PURPOSE. This module is also loaded directly by Node (native
 * type stripping) in `scripts/check-gaming-d1.ts`, which runs the shipped SQL and
 * mapping against a local D1 and checks results, rows read and query plans. Node
 * cannot load the workspace packages (extensionless relative imports), so the
 * only workspace imports here are type-only, which are erased. The queue mapper
 * is passed in for the same reason — callers pass `leagueQueue`.
 *
 * Ordering is `captured_at DESC, id DESC`: ids are UUID v7, so equal timestamps
 * fall back to insertion order.
 */
import type { MatchQueue, MatchSummary, RankInfo } from "@central-command/types";

// ─── Minimal structural D1 surface (satisfied by the Workers `D1Database`) ──────

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
}

export interface D1ResultLike {
  results: unknown[];
  meta: Record<string, unknown>;
}

export interface D1Like {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<D1ResultLike[]>;
}

/** One statement of a batch: its SQL and bound parameters. */
export interface StatementSpec {
  label: string;
  sql: string;
  params: (string | number)[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Payload cap across *all* queues, and the client then filters to one queue —
 * so this has to be generous enough that a busy queue is not truncated by
 * matches in the others. It was 20, tuned when the card drew a fixed six rows;
 * a resized card can now ask for twelve, and a user with 23 flex games saw
 * roughly 16 of them because solo games used up the budget. The LIMIT bounds
 * the rows D1 reads, not just what goes over the wire.
 */
export const MATCH_PAYLOAD_LIMIT = 60;

export const RANK_SQL =
  "SELECT queue_type AS queueType, tier, division, league_points AS leaguePoints, wins, losses " +
  "FROM gaming_snapshots WHERE user_id = ? AND kind = 'rank' AND queue_type = ? " +
  "ORDER BY captured_at DESC, id DESC LIMIT 1";

export const MATCHES_SQL =
  "SELECT match_id AS matchId, champion, position, queue_id AS queueId, win, kills, deaths, " +
  "assists, cs, duration_sec AS durationSec, score, captured_at AS capturedAt " +
  "FROM gaming_snapshots WHERE user_id = ? AND kind = 'match' " +
  `ORDER BY captured_at DESC, id DESC LIMIT ${MATCH_PAYLOAD_LIMIT}`;

/**
 * Matches in `[now - days, now]` (inclusive both ends, as `isWithinDays`), and
 * how many of them have `win = 1` — NULL / 0 / anything else counts as a loss.
 */
export const WINDOW_SQL =
  "SELECT COUNT(*) AS total, SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins " +
  "FROM gaming_snapshots WHERE user_id = ? AND kind = 'match' " +
  "AND captured_at >= ? AND captured_at <= ?";

/**
 * `/summary`'s window: the same `WINDOW_SQL`, behind a solo-rank gate. In SQLite
 * `CROSS JOIN` fixes the join order, so `gate` runs first and the window
 * subquery is only evaluated when it yields a row — a user without a solo rank
 * never scans matches. (An `AND EXISTS (...)` in the window's WHERE does not do
 * this: SQLite still walks the whole window range, testing it per row.) No
 * gate row means no result row, which maps to a null win rate.
 */
export const SUMMARY_WINDOW_SQL =
  "SELECT w.total, w.wins FROM (SELECT 1 WHERE EXISTS (SELECT 1 FROM gaming_snapshots " +
  "WHERE user_id = ? AND kind = 'rank' AND queue_type = 'solo')) AS gate " +
  `CROSS JOIN (${WINDOW_SQL}) AS w`;

const RANK_QUEUES = ["solo", "flex"] as const;

function windowParams(userId: string, days: number, now: number): (string | number)[] {
  return [userId, now - days * DAY_MS, now];
}

/** The five `/gaming` statements: solo rank, flex rank, match payload, 7d and 30d windows. */
export function gamingSpecs(userId: string, now: number): StatementSpec[] {
  return [
    { label: "rank solo", sql: RANK_SQL, params: [userId, "solo"] },
    { label: "rank flex", sql: RANK_SQL, params: [userId, "flex"] },
    { label: "matches", sql: MATCHES_SQL, params: [userId] },
    { label: "window 7d", sql: WINDOW_SQL, params: windowParams(userId, 7, now) },
    { label: "window 30d", sql: WINDOW_SQL, params: windowParams(userId, 30, now) },
  ];
}

/** The two `/summary` statements: solo rank and the solo-gated 7d window. */
export function summarySpecs(userId: string, now: number): StatementSpec[] {
  return [
    { label: "summary rank solo", sql: RANK_SQL, params: [userId, "solo"] },
    {
      label: "summary window 7d",
      sql: SUMMARY_WINDOW_SQL,
      params: [userId, ...windowParams(userId, 7, now)],
    },
  ];
}

/** Run specs as one D1 batch — one consistent snapshot for the whole response. */
export function runSpecs(db: D1Like, specs: StatementSpec[]): Promise<D1ResultLike[]> {
  return db.batch(specs.map((s) => db.prepare(s.sql).bind(...s.params)));
}

// ─── Mapping ────────────────────────────────────────────────────────────────

interface RankRow {
  queueType: string | null;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
}

interface MatchRow {
  matchId: string | null;
  champion: string | null;
  position: string | null;
  queueId: number | null;
  win: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  durationSec: number | null;
  score: number | null;
  capturedAt: number;
}

interface WindowRow {
  total: number | null;
  wins: number | null;
}

function rowsOf<T>(result: D1ResultLike | undefined): T[] {
  return (result?.results ?? []) as T[];
}

function winRateOf(result: D1ResultLike | undefined): number | null {
  const row = rowsOf<WindowRow>(result)[0];
  const total = Number(row?.total ?? 0);
  if (total === 0) return null;
  return Number(row?.wins ?? 0) / total;
}

function toRank(queueType: RankInfo["queueType"], r: RankRow): RankInfo {
  return {
    queueType,
    tier: r.tier ?? "",
    division: r.division ?? "",
    leaguePoints: r.leaguePoints ?? 0,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
  };
}

export interface GamingSnapshotData {
  ranks: RankInfo[];
  matches: MatchSummary[];
  winRate7d: number | null;
  winRate30d: number | null;
}

/** Map `gamingSpecs` results (same order) to the response fields. */
export function mapGaming(
  results: D1ResultLike[],
  queueOf: (queueId: number) => MatchQueue,
): GamingSnapshotData {
  const ranks: RankInfo[] = [];
  RANK_QUEUES.forEach((queueType, i) => {
    const latest = rowsOf<RankRow>(results[i])[0];
    if (latest) ranks.push(toRank(queueType, latest));
  });

  const matches: MatchSummary[] = rowsOf<MatchRow>(results[2]).map((r) => ({
    matchId: r.matchId ?? "",
    champion: r.champion ?? "",
    position: r.position ?? "",
    queue: queueOf(r.queueId ?? 0),
    win: r.win === 1,
    kills: r.kills ?? 0,
    deaths: r.deaths ?? 0,
    assists: r.assists ?? 0,
    cs: r.cs ?? 0,
    durationSec: r.durationSec ?? 0,
    score: r.score ?? 0,
    playedAt: r.capturedAt,
  }));

  return {
    ranks,
    matches,
    winRate7d: winRateOf(results[3]),
    winRate30d: winRateOf(results[4]),
  };
}

export type GamingSummary = { rank: string; winRate7d: number | null } | null;

/** Map `summarySpecs` results: `null` without a solo rank. */
export function mapSummary(results: D1ResultLike[]): GamingSummary {
  const solo = rowsOf<RankRow>(results[0])[0];
  if (!solo) return null;
  return {
    rank: `${solo.tier ?? ""} ${solo.division ?? ""}`.trim(),
    winRate7d: winRateOf(results[1]),
  };
}

/** `/gaming`'s ranks, match payload and win-rate windows, as of `now`. */
export async function loadGaming(
  db: D1Like,
  userId: string,
  now: number,
  queueOf: (queueId: number) => MatchQueue,
): Promise<GamingSnapshotData> {
  return mapGaming(await runSpecs(db, gamingSpecs(userId, now)), queueOf);
}

/** `/summary`'s latest solo rank and 7-day win rate, as of `now`. */
export async function loadGamingSummary(
  db: D1Like,
  userId: string,
  now: number,
): Promise<GamingSummary> {
  return mapSummary(await runSpecs(db, summarySpecs(userId, now)));
}
