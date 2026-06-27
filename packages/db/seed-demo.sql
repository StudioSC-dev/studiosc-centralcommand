-- Demo user seed — populates the shared public read-only demo account.
--
-- Idempotent: deletes the demo user's rows then re-inserts. Dates are RELATIVE
-- (strftime/unixepoch 'now'), so re-running refreshes the trailing window.
-- Run:  wrangler d1 execute central-command-db --local  --file=packages/db/seed-demo.sql
--       wrangler d1 execute central-command-db --remote --file=packages/db/seed-demo.sql
--
-- The user id/email MUST match apps/api/src/demo/constants.ts.

-- ── Reset (children first) ───────────────────────────────────────────────────
DELETE FROM performance_scores WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM sleep_logs        WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM nutrition_logs    WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM fitness_logs      WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM tasks             WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM gaming_snapshots  WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM gaming_providers  WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM weather_snapshots WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM user_settings     WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM user_profiles     WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM users             WHERE id      = 'demo0000-0000-7000-8000-000000000000';

-- ── Identity / profile / settings ────────────────────────────────────────────
INSERT INTO users (id, email, created_at)
VALUES ('demo0000-0000-7000-8000-000000000000', 'demo@centralcommand.studiosc.dev', unixepoch('now') * 1000);

INSERT INTO user_profiles (user_id, display_name, birthdate, sex, height_cm, weight_kg, activity_level, created_at, updated_at)
VALUES ('demo0000-0000-7000-8000-000000000000', 'Alex Rivera', '1993-07-15', 'male', 178, 74, 'active', unixepoch('now') * 1000, unixepoch('now') * 1000);

INSERT INTO user_settings (user_id, timezone, home_lat, home_lon, location_label, units, created_at, updated_at)
VALUES ('demo0000-0000-7000-8000-000000000000', 'America/New_York', 40.71, -74.01, 'New York, NY', 'metric', unixepoch('now') * 1000, unixepoch('now') * 1000);

-- ── Performance scores (last 30 days) ────────────────────────────────────────
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 29)
INSERT INTO performance_scores (id, user_id, date, score, sleep_score, nutrition_score, hrv_score, scored_at)
SELECT
  'demo-perf-' || n,
  'demo0000-0000-7000-8000-000000000000',
  strftime('%Y-%m-%d', 'now', '-' || n || ' days'),
  CAST((60 + (n * 7) % 30) * 0.4 + (55 + (n * 11) % 35) * 0.35 + 50 * 0.25 AS INTEGER),
  60 + (n * 7) % 30,
  55 + (n * 11) % 35,
  50,
  unixepoch('now', '-' || n || ' days') * 1000
FROM seq;

-- ── Sleep logs (last 30 nights, with HRV + resting HR) ───────────────────────
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 29)
INSERT INTO sleep_logs (id, user_id, date, duration_min, quality, hrv, resting_hr, logged_at)
SELECT
  'demo-sleep-' || n,
  'demo0000-0000-7000-8000-000000000000',
  strftime('%Y-%m-%d', 'now', '-' || n || ' days'),
  360 + (n * 23) % 160,
  3 + (n % 3),
  45 + (n * 5) % 35,
  52 + (n * 3) % 16,
  unixepoch('now', '-' || n || ' days') * 1000
FROM seq;

-- ── Nutrition logs (last 7 days, 2 meals/day; today's drive the live score) ──
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 6)
INSERT INTO nutrition_logs (id, user_id, meal, calories, protein, carbs, fat, logged_at)
SELECT 'demo-nut-' || n || '-a', 'demo0000-0000-7000-8000-000000000000', 'Breakfast', 620, 32, 70, 18,
  unixepoch('now', '-' || n || ' days') * 1000 - 18000000 FROM seq;
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 6)
INSERT INTO nutrition_logs (id, user_id, meal, calories, protein, carbs, fat, logged_at)
SELECT 'demo-nut-' || n || '-b', 'demo0000-0000-7000-8000-000000000000', 'Dinner', 820, 46, 80, 28,
  unixepoch('now', '-' || n || ' days') * 1000 - 3600000 FROM seq;

-- ── Fitness logs (recent; last run 3 days ago → "good day for a run" insight) ─
INSERT INTO fitness_logs (id, user_id, activity, duration_min, intensity, logged_at) VALUES
  ('demo-fit-0', 'demo0000-0000-7000-8000-000000000000', 'Weightlifting', 50, 4, unixepoch('now') * 1000 - 7200000),
  ('demo-fit-1', 'demo0000-0000-7000-8000-000000000000', 'Cycling', 40, 3, unixepoch('now', '-1 days') * 1000),
  ('demo-fit-3', 'demo0000-0000-7000-8000-000000000000', 'Running', 35, 4, unixepoch('now', '-3 days') * 1000),
  ('demo-fit-5', 'demo0000-0000-7000-8000-000000000000', 'Yoga', 30, 2, unixepoch('now', '-5 days') * 1000),
  ('demo-fit-7', 'demo0000-0000-7000-8000-000000000000', 'Running', 42, 4, unixepoch('now', '-7 days') * 1000),
  ('demo-fit-10', 'demo0000-0000-7000-8000-000000000000', 'Running', 48, 5, unixepoch('now', '-10 days') * 1000),
  ('demo-fit-12', 'demo0000-0000-7000-8000-000000000000', 'Swimming', 35, 3, unixepoch('now', '-12 days') * 1000);

-- ── Tasks (4 cleared today + 3 open high-priority → break/prioritize insights) ─
INSERT INTO tasks (id, user_id, title, priority, status, position, source, external_id, deadline, created_at, completed_at) VALUES
  ('demo-task-1', 'demo0000-0000-7000-8000-000000000000', 'Ship dashboard redesign', 'high', 'open', 0, 'native', NULL, NULL, unixepoch('now','-2 days')*1000, NULL),
  ('demo-task-2', 'demo0000-0000-7000-8000-000000000000', 'Prep quarterly review deck', 'high', 'open', 1, 'native', NULL, unixepoch('now','+2 days')*1000, unixepoch('now','-2 days')*1000, NULL),
  ('demo-task-3', 'demo0000-0000-7000-8000-000000000000', 'Fix auth edge case', 'high', 'open', 2, 'native', NULL, NULL, unixepoch('now','-1 days')*1000, NULL),
  ('demo-task-4', 'demo0000-0000-7000-8000-000000000000', 'Reply to recruiter', 'med', 'open', 3, 'native', NULL, NULL, unixepoch('now','-1 days')*1000, NULL),
  ('demo-task-5', 'demo0000-0000-7000-8000-000000000000', 'Water the plants', 'low', 'open', 4, 'native', NULL, NULL, unixepoch('now','-3 days')*1000, NULL),
  ('demo-task-6', 'demo0000-0000-7000-8000-000000000000', 'Morning workout', 'med', 'done', 5, 'native', NULL, NULL, unixepoch('now','-1 days')*1000, unixepoch('now')*1000),
  ('demo-task-7', 'demo0000-0000-7000-8000-000000000000', 'Inbox zero', 'med', 'done', 6, 'native', NULL, NULL, unixepoch('now','-1 days')*1000, unixepoch('now')*1000),
  ('demo-task-8', 'demo0000-0000-7000-8000-000000000000', 'Stand-up notes', 'low', 'done', 7, 'native', NULL, NULL, unixepoch('now')*1000, unixepoch('now')*1000),
  ('demo-task-9', 'demo0000-0000-7000-8000-000000000000', 'Review PR #142', 'high', 'done', 8, 'native', NULL, NULL, unixepoch('now')*1000, unixepoch('now')*1000);

-- ── Gaming (Riot / League): provider + ranks + recent matches ────────────────
INSERT INTO gaming_providers (id, user_id, provider, game, riot_id, region, puuid, summoner_id, created_at)
VALUES ('demo-gp-1', 'demo0000-0000-7000-8000-000000000000', 'riot', 'league', 'DemoSummoner#NA1', 'na1', 'demo-puuid', NULL, unixepoch('now') * 1000);

INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses) VALUES
  ('demo-rank-solo', 'demo0000-0000-7000-8000-000000000000', 'league', 'rank', unixepoch('now')*1000, 'solo', 'PLATINUM', 'II', 47, 88, 80),
  ('demo-rank-flex', 'demo0000-0000-7000-8000-000000000000', 'league', 'rank', unixepoch('now')*1000, 'flex', 'GOLD', 'I', 12, 30, 28);

WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 11)
INSERT INTO gaming_snapshots
  (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score)
SELECT
  'demo-match-' || n,
  'demo0000-0000-7000-8000-000000000000',
  'league', 'match',
  unixepoch('now', '-' || (n * 14) || ' hours') * 1000,
  'DEMO_NA1_' || n,
  CASE n % 5 WHEN 0 THEN 'Ahri' WHEN 1 THEN 'Lee Sin' WHEN 2 THEN 'Jinx' WHEN 3 THEN 'Thresh' ELSE 'Garen' END,
  CASE n % 5 WHEN 0 THEN 'MIDDLE' WHEN 1 THEN 'JUNGLE' WHEN 2 THEN 'BOTTOM' WHEN 3 THEN 'UTILITY' ELSE 'TOP' END,
  -- Spread across queues so the demo populates all four tabs (420 solo · 440 flex · 450 aram · 400 normal).
  CASE n % 6 WHEN 4 THEN 440 WHEN 5 THEN 450 WHEN 3 THEN 400 ELSE 420 END,
  (n + 1) % 2,
  4 + (n * 3) % 9,
  2 + (n * 2) % 7,
  6 + (n * 5) % 12,
  140 + (n * 17) % 90,
  1500 + (n * 97) % 900,
  42 + (n * 13) % 45
FROM seq;

-- ── Weather snapshots (last 30 days; ~5 wet → weather↔performance insight) ────
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 29)
INSERT INTO weather_snapshots (id, user_id, date, temp_c, condition, rain_1h, captured_at)
SELECT
  'demo-wx-' || n,
  'demo0000-0000-7000-8000-000000000000',
  strftime('%Y-%m-%d', 'now', '-' || n || ' days'),
  18 + (n * 7) % 12,
  CASE WHEN n % 6 = 3 THEN 'light rain' ELSE 'clear sky' END,
  CASE WHEN n % 6 = 3 THEN 2.5 ELSE NULL END,
  unixepoch('now', '-' || n || ' days') * 1000
FROM seq;
