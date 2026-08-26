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
-- No saved presets are seeded: edit mode is demo-gated, so a visitor never sees
-- the preset row. The delete is here anyway so the reset stays total.
DELETE FROM notifications        WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM notification_sources WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM lab_snapshots     WHERE source_id IN (SELECT id FROM lab_sources WHERE user_id = 'demo0000-0000-7000-8000-000000000000');
DELETE FROM lab_sources       WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM card_presets      WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
DELETE FROM dashboard_cards   WHERE user_id = 'demo0000-0000-7000-8000-000000000000';
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

-- ── Dashboard layout ─────────────────────────────────────────────────────────
-- One row per exception (docs/ui-suite.md D15). Exactly one is needed here.
--
-- Nothing is hidden: the demo shows all ELEVEN cards, so a visitor sees the full
-- dashboard. Edit mode is hidden for demo sessions, and demoReadOnly blocks the
-- PATCH server-side regardless.
--
-- No positions: registry order is the intended demo arrangement, and storing it
-- would only freeze a default that is already correct.
--
-- Weather gets a WIDE tile, so a visitor sees that cards can be more than one
-- size without having to be told.
--
-- IT WAS 2x2 UNTIL THE HOMELAB AND NOTIFICATIONS CARDS SHIPPED, and that had to
-- change rather than being carried forward. The cap is 4 x 3 = 12 cells
-- (docs/ui-suite.md D2/D9). Nine cards with one 2x2 was 8 + 4 = 12, exactly
-- full. Eleven cards with that same 2x2 is 10 + 4 = 14, which no shape up to
-- four columns can pack into three rows — the demo would have rendered
-- `overflows` on the one dashboard nobody signed in to fix.
--
-- 2x1 restores the property: 10 one-cell cards + one two-cell card = 12, and
-- Weather is first in registry order, so gridShape() derives a 4x3 wall with
-- zero holes. A wide card placed *late* in the order would push past three rows
-- instead — position matters as much as size.
INSERT INTO dashboard_cards (user_id, card, hidden, position, size, updated_at)
VALUES ('demo0000-0000-7000-8000-000000000000', 'weather', 0, NULL, '2x1', unixepoch('now') * 1000);

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

-- ── Fictional homelab (D4) ───────────────────────────────────────────────────
--
-- The demo gets its OWN lab source with INVENTED service names. This is not a
-- nicety: Central Command is a portfolio piece and demo mode is scheduled to
-- open to any Google account, so a real snapshot on screen would publish the
-- actual service inventory and up/down timing of a private network.
--
-- It is enforced SERVER-SIDE, in readLab(), which scopes every read to the
-- session's user id. Card visibility is a preference and must NEVER be treated
-- as the control here — a visitor who un-hides the card still reaches only this
-- row. See the risk register in ../integrations/homelab-telemetry.md.
--
-- The token hash is a literal, not a hash of anything. sourceForToken() compares
-- against the SHA-256 hex of what a caller presented — always 64 hex characters
-- — so this value cannot be matched by any token that exists, and nothing can
-- ever push to the demo source.
INSERT INTO lab_sources (id, user_id, label, token_hash, created_at, rotated_at, last_seen_at, agent_version)
VALUES (
  'demolab0-0000-7000-8000-000000000000',
  'demo0000-0000-7000-8000-000000000000',
  'Demo Lab',
  'demo-source-not-a-sha256-and-therefore-unmatchable',
  unixepoch('now', '-30 days') * 1000,
  NULL,
  -- Relative, so the demo always renders FRESH. A fixed timestamp would drift
  -- past the 15-minute band and show every visitor an "offline" lab within the
  -- hour — the card working correctly, on data that was never meant to age.
  unixepoch('now', '-40 seconds') * 1000,
  '0.1.0-demo'
);

-- One down service and one unhealthy collector, deliberately: an all-green
-- snapshot would show the card at its least informative, and the design point is
-- that it is most useful exactly when something is wrong.
INSERT INTO lab_snapshots (source_id, version, captured_at, received_at, sections, agent_version)
VALUES (
  'demolab0-0000-7000-8000-000000000000',
  1,
  unixepoch('now', '-40 seconds') * 1000,
  unixepoch('now', '-40 seconds') * 1000,
  json_object(
    'monitors', json_object(
      'ok', json('true'),
      'data', json_object(
        'counts', json_object('up', 11, 'down', 1, 'paused', 1),
        'items', json_array(
          json_object('key','1','label','Media Server','status','up','uptime24h',99.9),
          json_object('key','2','label','Photo Vault','status','up','uptime24h',100),
          json_object('key','3','label','Document Store','status','up','uptime24h',99.7),
          json_object('key','4','label','Password Vault','status','up','uptime24h',100),
          json_object('key','5','label','Reverse Proxy','status','up','uptime24h',100),
          json_object('key','6','label','DNS Filter','status','up','uptime24h',99.8),
          json_object('key','7','label','Dashboard','status','up','uptime24h',99.9),
          json_object('key','8','label','Home Automation','status','up','uptime24h',98.4),
          json_object('key','9','label','Notification Bus','status','up','uptime24h',100),
          json_object('key','10','label','Backup Agent','status','up','uptime24h',99.5),
          json_object('key','11','label','Container Metrics','status','up','uptime24h',99.9),
          json_object('key','12','label','Subtitle Fetcher','status','down',
                      'since', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 minutes'), 'uptime24h', 96.1),
          json_object('key','13','label','Indexer','status','paused','uptime24h',0)
        )
      )
    ),
    'backups', json_object(
      'ok', json('true'),
      'data', json_object('plans', json_array(
        json_object('key','offsite','label','Offsite Snapshot',
                    'lastRunAt', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours'), 'result','ok'),
        json_object('key','local','label','Local Snapshot',
                    'lastRunAt', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'), 'result','ok')
      ))
    ),
    'images', json_object(
      'ok', json('true'),
      'data', json_object('pendingUpdates', 3, 'items', json_array(
        json_object('key','media','label','Media Server'),
        json_object('key','photos','label','Photo Vault'),
        json_object('key','docs','label','Document Store')
      ))
    ),
    -- One section failing on purpose. It is the shape a visitor should see at
    -- least once: the card says WHICH collector is unreachable rather than
    -- rendering an empty list that reads as "all clear".
    'containers', json_object('ok', json('false'), 'error', 'unreachable')
  ),
  '0.1.0-demo'
);

-- ── Notifications (the spine, multi-source) ──────────────────────────────────
--
-- Three sources on purpose, and two KINDS of source, because that distinction is
-- the whole design: `lab` is a FEED (rows below, each dismissable) while `gmail`
-- and `slack` are COUNT-ONLY (a number from a collector, no rows). A demo with
-- only the lab connected would show a card that looks like it can do only one of
-- those.
INSERT INTO notification_sources (user_id, source, label, unread_count, last_event_at, last_sync_at, state, updated_at)
VALUES
  -- NULL unread_count → derived from the feed rows below. That is what every
  -- feed source does.
  ('demo0000-0000-7000-8000-000000000000', 'lab', 'Homelab', NULL,
   unixepoch('now', '-14 minutes') * 1000, unixepoch('now') * 1000, 'ok', unixepoch('now') * 1000),
  ('demo0000-0000-7000-8000-000000000000', 'gmail', 'Gmail', 12,
   unixepoch('now', '-35 minutes') * 1000, unixepoch('now') * 1000, 'ok', unixepoch('now') * 1000),
  ('demo0000-0000-7000-8000-000000000000', 'slack', 'Slack', 4,
   unixepoch('now', '-2 hours') * 1000, unixepoch('now') * 1000, 'ok', unixepoch('now') * 1000);

INSERT INTO notifications (id, user_id, source, kind, external_id, title, body, link, priority, tags, published_at, status, snooze_until, read_at, created_at)
VALUES
  ('demonot0-0000-7000-8000-000000000001', 'demo0000-0000-7000-8000-000000000000',
   'lab', 'alert', 'demo-evt-1', 'Subtitle Fetcher is DOWN',
   'No response from subtitle-fetcher for 3 consecutive checks.', NULL, 5, '["rotating_light"]',
   unixepoch('now', '-14 minutes') * 1000, 'unread', NULL, NULL, unixepoch('now') * 1000),
  ('demonot0-0000-7000-8000-000000000002', 'demo0000-0000-7000-8000-000000000000',
   'lab', 'alert', 'demo-evt-2', 'Image updates available',
   '3 containers have newer images upstream.', NULL, 3, '["package"]',
   unixepoch('now', '-52 minutes') * 1000, 'unread', NULL, NULL, unixepoch('now') * 1000),
  ('demonot0-0000-7000-8000-000000000003', 'demo0000-0000-7000-8000-000000000000',
   'lab', 'alert', 'demo-evt-3', 'Offsite snapshot completed',
   'Offsite Snapshot finished in 4m 12s.', NULL, 2, '["white_check_mark"]',
   unixepoch('now', '-6 hours') * 1000, 'unread', NULL, NULL, unixepoch('now') * 1000),
  -- One already handled, so the demo shows the state the count is driven toward
  -- and the prune job has something in range to reason about.
  ('demonot0-0000-7000-8000-000000000004', 'demo0000-0000-7000-8000-000000000000',
   'lab', 'alert', 'demo-evt-4', 'Home Automation recovered',
   'home-automation is answering again.', NULL, 3, '["white_check_mark"]',
   unixepoch('now', '-1 days') * 1000, 'read', NULL, unixepoch('now', '-23 hours') * 1000, unixepoch('now') * 1000);
