/**
 * Deterministic check of the bounded gaming reads (services/gaming-queries.ts)
 * against a LOCAL D1 loaded with scripts/fixtures/gaming-d1.sql.
 *
 * It runs the shipped SQL and mapping — not a copy — and asserts:
 *   - results for fixture users A–E equal a reference computed here from a full
 *     `SELECT *` with the pre-0032 JS logic (inlined `isWithinDays` at T0) and the
 *     declared `captured_at DESC, id DESC` tie order;
 *   - every statement reports a numeric `meta.rows_read` within 2 × rows + 2, and
 *     the 2,000-row rank lookup reads fewer than 10;
 *   - EXPLAIN QUERY PLAN names the intended index and has no `USE TEMP B-TREE`;
 *   - the notifications feed query uses notifications_source_feed_idx and reads ≤ 2 × 50 + 2.
 *
 * Use an isolated state dir — never the developer's .wrangler/state. With no
 * `wrangler dev` running (apply migrations only then; see guard-no-dev.js):
 *
 *   wrangler d1 migrations apply central-command-db --local --persist-to <dir>
 *   wrangler d1 execute central-command-db --local --persist-to <dir> \
 *     --file scripts/fixtures/gaming-d1.sql
 *   node --experimental-strip-types scripts/check-gaming-d1.ts --persist-to <dir>
 *
 * Run with Node ≥ 22.18 (native type stripping). It imports only type-strippable
 * files with no workspace runtime imports: `league.ts` has no imports of its own.
 */
import { getPlatformProxy } from "wrangler";
import { leagueQueue } from "../../../packages/utils/src/league.ts";
import {
  gamingSpecs,
  mapGaming,
  mapSummary,
  runSpecs,
  summarySpecs,
  type D1Like,
  type D1ResultLike,
  type GamingSnapshotData,
  type GamingSummary,
  type StatementSpec,
} from "../src/services/gaming-queries.ts";

// No @types/node in this repo (and no new dependency for a dev script): declare
// the one global used.
declare const process: { argv: string[]; exitCode: number | undefined };

const T0 = 1790000000000;
const DAY_MS = 24 * 60 * 60 * 1000;
const USERS = ["fx-user-a", "fx-user-b", "fx-user-c", "fx-user-d", "fx-user-e"] as const;
const RANK_IDX = "gaming_snapshots_rank_idx";
const KIND_TIME_IDX = "gaming_snapshots_kind_time_idx";
const FEED_IDX = "notifications_source_feed_idx";

// Copied from the Drizzle-generated statement for services/notifications.ts
// `recentFromSource(db, userId, source, 50)` (QueryBuilder#toSQL), values inlined.
const FEED_SQL =
  'select "id", "user_id", "source", "kind", "external_id", "title", "body", "link", ' +
  '"priority", "tags", "published_at", "status", "snooze_until", "read_at", "created_at" ' +
  'from "notifications" where ("notifications"."user_id" = \'fx-user-a\' and ' +
  '"notifications"."source" = \'lab\') order by "notifications"."published_at" desc limit 50';
const FEED_LIMIT = 50;

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => k in rb && deepEqual(ra[k], rb[k]));
}

function persistDir(): string {
  const i = process.argv.indexOf("--persist-to");
  const dir = i >= 0 ? process.argv[i + 1] : undefined;
  if (!dir) {
    throw new Error(
      "Pass --persist-to <dir>: the same isolated dir given to `wrangler d1 ... --persist-to`. " +
        "This check refuses to default to the developer's .wrangler/state.",
    );
  }
  return dir;
}

// ─── Reference: the pre-0032 JS logic over a full SELECT * ───────────────────

interface SnapshotRow {
  id: string;
  kind: string;
  captured_at: number;
  match_id: string | null;
  champion: string | null;
  position: string | null;
  queue_id: number | null;
  win: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  duration_sec: number | null;
  score: number | null;
  queue_type: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
}

/** `isWithinDays(epochMs, days, T0)` from packages/utils, inlined. */
function isWithinDaysAtT0(epochMs: number, days: number): boolean {
  return epochMs >= T0 - days * DAY_MS && epochMs <= T0;
}

function byDeclaredOrder(a: SnapshotRow, b: SnapshotRow): number {
  if (a.captured_at !== b.captured_at) return b.captured_at - a.captured_at;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function referenceWinRate(matchRows: SnapshotRow[], days: number): number | null {
  const inWindow = matchRows.filter((r) => isWithinDaysAtT0(r.captured_at, days));
  if (inWindow.length === 0) return null;
  return inWindow.filter((r) => r.win === 1).length / inWindow.length;
}

function referenceGaming(rows: SnapshotRow[]): GamingSnapshotData {
  const rankRows = rows.filter((r) => r.kind === "rank");
  const ranks: GamingSnapshotData["ranks"] = [];
  for (const queueType of ["solo", "flex"] as const) {
    const latest = rankRows.find((r) => r.queue_type === queueType);
    if (latest) {
      ranks.push({
        queueType,
        tier: latest.tier ?? "",
        division: latest.division ?? "",
        leaguePoints: latest.league_points ?? 0,
        wins: latest.wins ?? 0,
        losses: latest.losses ?? 0,
      });
    }
  }
  const matchRows = rows.filter((r) => r.kind === "match");
  const matches = matchRows.slice(0, 60).map((r) => ({
    matchId: r.match_id ?? "",
    champion: r.champion ?? "",
    position: r.position ?? "",
    queue: leagueQueue(r.queue_id ?? 0),
    win: r.win === 1,
    kills: r.kills ?? 0,
    deaths: r.deaths ?? 0,
    assists: r.assists ?? 0,
    cs: r.cs ?? 0,
    durationSec: r.duration_sec ?? 0,
    score: r.score ?? 0,
    playedAt: r.captured_at,
  }));
  return {
    ranks,
    matches,
    winRate7d: referenceWinRate(matchRows, 7),
    winRate30d: referenceWinRate(matchRows, 30),
  };
}

function referenceSummary(rows: SnapshotRow[]): GamingSummary {
  const solo = rows.find((r) => r.kind === "rank" && r.queue_type === "solo");
  if (!solo) return null;
  const matches = rows.filter((r) => r.kind === "match");
  return {
    rank: `${solo.tier ?? ""} ${solo.division ?? ""}`.trim(),
    winRate7d: referenceWinRate(matches, 7),
  };
}

// ─── rows_read and query plans ──────────────────────────────────────────────

function rowsRead(result: D1ResultLike | undefined): number | null {
  const v = result?.meta["rows_read"];
  return typeof v === "number" ? v : null;
}

/**
 * Rows a statement legitimately touches: returned rows, or the window's COUNT.
 * The summary window also matches the solo-rank row its gate probes — a result
 * row exists only when the gate opened — so that row counts too.
 */
function matchingRows(spec: StatementSpec, result: D1ResultLike | undefined): number {
  const rows = result?.results ?? [];
  if (spec.label.includes("window")) {
    const first = rows[0] as { total?: unknown } | undefined;
    const gateRow = spec.label.startsWith("summary") && first ? 1 : 0;
    return Number(first?.total ?? 0) + gateRow;
  }
  return rows.length;
}

function checkRowsRead(user: string, specs: StatementSpec[], results: D1ResultLike[]): void {
  specs.forEach((spec, i) => {
    const result = results[i];
    const read = rowsRead(result);
    const n = matchingRows(spec, result);
    const bound = 2 * n + 2;
    console.log(
      `  rows_read  ${user}  ${spec.label.padEnd(18)} rows=${String(n).padStart(3)}  ` +
        `rows_read=${read === null ? "MISSING" : read}  bound=${bound}`,
    );
    check(read !== null, `${user} ${spec.label}: meta.rows_read is numeric`);
    if (read !== null) check(read <= bound, `${user} ${spec.label}: rows_read ${read} <= ${bound}`);
  });
}

async function explain(db: D1Like, sql: string, params: (string | number)[]): Promise<string[]> {
  const [result] = await db.batch([db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params)]);
  return (result?.results ?? []).map((r) => String((r as { detail?: unknown }).detail ?? ""));
}

async function checkPlan(db: D1Like, label: string, sql: string, params: (string | number)[], indexes: string[]) {
  const lines = await explain(db, sql, params);
  for (const line of lines) console.log(`  plan  ${label.padEnd(18)} ${line}`);
  for (const idx of indexes) check(lines.some((l) => l.includes(idx)), `${label}: plan uses ${idx}`);
  check(!lines.some((l) => l.includes("USE TEMP B-TREE")), `${label}: no USE TEMP B-TREE`);
}

function expectedIndexes(label: string): string[] {
  if (label === "summary window 7d") return [KIND_TIME_IDX, RANK_IDX];
  if (label.startsWith("rank") || label === "summary rank solo") return [RANK_IDX];
  return [KIND_TIME_IDX];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Path quirk: `wrangler d1 ... --persist-to <dir>` stores D1 under `<dir>/v3/d1`,
  // but getPlatformProxy's `persist.path` is used as-is (it expects the `v3` level).
  // Take the CLI's dir and append `/v3` so both see the same database.
  // Run from apps/api (as `pnpm check:gaming-d1` does): wrangler.toml is read from the cwd.
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    persist: { path: `${persistDir()}/v3` },
  });
  const db: D1Like = proxy.env.DB;

  try {
    const [fixture] = await db.batch([
      db
        .prepare("SELECT COUNT(*) AS n FROM gaming_snapshots WHERE user_id = ? AND kind = 'rank' AND queue_type = 'solo'")
        .bind("fx-user-a"),
    ]);
    const soloRows = Number((fixture?.results[0] as { n?: unknown } | undefined)?.n ?? 0);
    if (soloRows !== 2000) {
      throw new Error(`Fixture not loaded (A has ${soloRows} solo rank rows, expected 2000).`);
    }

    console.log("\n== Results vs reference (now = T0) ==");
    for (const user of USERS) {
      const [all] = await db.batch([db.prepare("SELECT * FROM gaming_snapshots WHERE user_id = ?").bind(user)]);
      const rows = ((all?.results ?? []) as SnapshotRow[]).slice().sort(byDeclaredOrder);

      const gSpecs = gamingSpecs(user, T0);
      const gResults = await runSpecs(db, gSpecs);
      const gaming = mapGaming(gResults, leagueQueue);
      const gRef = referenceGaming(rows);
      const gOk = deepEqual(gaming, gRef);
      check(gOk, `${user} /gaming: ranks, matches, winRate7d, winRate30d equal reference`);
      if (!gOk) console.log(`        got ${JSON.stringify(gaming)}\n        ref ${JSON.stringify(gRef)}`);
      console.log(
        `        ranks=${JSON.stringify(gaming.ranks.map((r) => `${r.queueType}:${r.tier} ${r.division}`))} ` +
          `matches=${gaming.matches.length} winRate7d=${gaming.winRate7d} winRate30d=${gaming.winRate30d}`,
      );

      const sSpecs = summarySpecs(user, T0);
      const sResults = await runSpecs(db, sSpecs);
      const summary = mapSummary(sResults);
      const sRef = referenceSummary(rows);
      check(deepEqual(summary, sRef), `${user} /summary gaming equals reference: ${JSON.stringify(summary)}`);

      checkRowsRead(user, gSpecs, gResults);
      checkRowsRead(user, sSpecs, sResults);
      if (user === "fx-user-a") {
        const read = rowsRead(gResults[0]);
        check(read !== null && read < 10, `fx-user-a rank solo over 2,000 rows reads < 10 (${read})`);
      }
    }

    console.log("\n== Fixture intent (spot checks on A, D, E) ==");
    const a = mapGaming(await runSpecs(db, gamingSpecs("fx-user-a", T0)), leagueQueue);
    check(a.ranks[0]?.tier === "PLATINUM", "A: tied-latest solo rank resolves to id DESC (PLATINUM)");
    check(a.matches[0]?.matchId === "NA1_T0_1MS", "A: future row (T0 + 1ms) is in the payload, first");
    check(
      a.matches[9]?.matchId === "NA1_9009" && a.matches[10]?.matchId === "NA1_9008",
      "A: tied pair at payload rows 10-11 ordered by id DESC",
    );
    check(
      a.matches.length === 60 &&
        a.matches[59]?.matchId === "NA1_9057" &&
        !a.matches.some((m) => m.matchId === "NA1_9056"),
      "A: tied pair straddling the cutoff keeps fx-a-m-0057, drops fx-a-m-0056",
    );
    // 7d window: n = 1..21 plus T0 and T0-7d; not T0-7d-1ms, not T0+1ms.
    const [w7] = await runSpecs(db, [gamingSpecs("fx-user-a", T0)[3]!]);
    const total7 = Number((w7?.results[0] as { total?: unknown } | undefined)?.total ?? -1);
    check(total7 === 23, `A: 7d window counts T0 and T0-7d inclusive, excludes T0-7d-1ms and T0+1ms (${total7} = 21 + 2)`);
    const d = mapGaming(await runSpecs(db, gamingSpecs("fx-user-d", T0)), leagueQueue);
    check(d.winRate7d === null && d.winRate30d === null && d.matches.length === 3, "D: only >30d matches -> both windows null");
    const e = mapSummary(await runSpecs(db, summarySpecs("fx-user-e", T0)));
    check(e?.winRate7d === 0, "E: all-NULL-win 7d window -> winRate7d 0");
    const b = mapSummary(await runSpecs(db, summarySpecs("fx-user-b", T0)));
    check(b === null, "B: no solo rank -> summary gaming null");

    console.log("\n== Query plans (user A) ==");
    for (const spec of [...gamingSpecs("fx-user-a", T0), ...summarySpecs("fx-user-a", T0)]) {
      await checkPlan(db, spec.label, spec.sql, spec.params, expectedIndexes(spec.label));
    }

    console.log("\n== Notifications feed (recentFromSource, A / lab / 50) ==");
    const [idx] = await db.batch([
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind(FEED_IDX),
    ]);
    const feedIndexExists = (idx?.results.length ?? 0) > 0;
    const [feed] = await db.batch([db.prepare(FEED_SQL)]);
    const feedRead = rowsRead(feed);
    console.log(`  rows_read  fx-user-a  feed lab limit 50   rows=${feed?.results.length ?? 0}  rows_read=${feedRead}`);
    const feedPlan = await explain(db, FEED_SQL, []);
    for (const line of feedPlan) console.log(`  plan  feed               ${line}`);
    check(feedIndexExists, `feed: index ${FEED_IDX} present`);
    check(feed?.results.length === FEED_LIMIT, `feed: returns exactly ${FEED_LIMIT} rows (got ${feed?.results.length ?? 0})`);
    check(feedRead !== null, "feed: meta.rows_read is numeric");
    if (feedRead !== null) {
      check(feedRead <= 2 * FEED_LIMIT + 2, `feed: rows_read ${feedRead} <= ${2 * FEED_LIMIT + 2}`);
    }
    check(feedPlan.some((l) => l.includes(FEED_IDX)), `feed: plan uses ${FEED_IDX}`);
    check(!feedPlan.some((l) => l.includes("USE TEMP B-TREE")), "feed: no USE TEMP B-TREE");
  } finally {
    await proxy.dispose();
  }

  console.log(failures === 0 ? "\nPASS" : `\nFAIL: ${failures} check(s) failed`);
  if (failures > 0) process.exitCode = 1;
}

await main();
