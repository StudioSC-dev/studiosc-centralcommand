-- Fixture for scripts/check-gaming-d1.ts. LOCAL D1 ONLY — never --remote.
--
-- Every timestamp is relative to T0 = 1790000000000 (the check's fixed clock);
-- 86400000 = one day, 3600000 = one hour. Idempotent: deletes every row owned by
-- the fixture users before inserting.
--
--   A  solo + flex ranks (2,000 solo rows, tied-latest pair GOLD/PLATINUM);
--      90 matches: 86 every 7.9h plus boundary rows at T0 - 7d, T0 - 7d - 1ms,
--      T0 and T0 + 1ms; win values 1 / 0 / NULL / 2; a tied pair at payload
--      positions 10-11 and one straddling the 60-row cutoff (positions 60-61);
--      300 notifications across `lab` and `trailhead`.
--   B  flex rank only + 5 recent matches (summary -> gaming: null); 100 `lab`
--      notifications (the "other user" for the feed check).
--   C  user only: no provider, no snapshots (/gaming -> connected: false).
--   D  solo rank; matches only older than 30 days (both windows null).
--   E  solo rank; 7-day matches all with NULL win (winRate7d 0).

DELETE FROM notifications WHERE user_id IN ('fx-user-a','fx-user-b','fx-user-c','fx-user-d','fx-user-e');
DELETE FROM performance_scores WHERE user_id IN ('fx-user-a','fx-user-b','fx-user-c','fx-user-d','fx-user-e');
DELETE FROM gaming_snapshots WHERE user_id IN ('fx-user-a','fx-user-b','fx-user-c','fx-user-d','fx-user-e');
DELETE FROM gaming_providers WHERE user_id IN ('fx-user-a','fx-user-b','fx-user-c','fx-user-d','fx-user-e');
DELETE FROM users WHERE id IN ('fx-user-a','fx-user-b','fx-user-c','fx-user-d','fx-user-e');

INSERT INTO users (id, email, created_at) VALUES
  ('fx-user-a', 'fx-a@fixture.invalid', 1790000000000),
  ('fx-user-b', 'fx-b@fixture.invalid', 1790000000000),
  ('fx-user-c', 'fx-c@fixture.invalid', 1790000000000),
  ('fx-user-d', 'fx-d@fixture.invalid', 1790000000000),
  ('fx-user-e', 'fx-e@fixture.invalid', 1790000000000);

INSERT INTO gaming_providers (id, user_id, provider, game, riot_id, region, puuid, created_at) VALUES
  ('fx-prov-a', 'fx-user-a', 'riot', 'league', 'FixtureA#FX1', 'na1', 'fx-puuid-a', 1790000000000),
  ('fx-prov-b', 'fx-user-b', 'riot', 'league', 'FixtureB#FX1', 'na1', 'fx-puuid-b', 1790000000000),
  ('fx-prov-d', 'fx-user-d', 'riot', 'league', 'FixtureD#FX1', 'na1', 'fx-puuid-d', 1790000000000),
  ('fx-prov-e', 'fx-user-e', 'riot', 'league', 'FixtureE#FX1', 'na1', 'fx-puuid-e', 1790000000000);

-- A: 1,998 older SILVER solo rank rows, one a minute, plus the tied-latest pair.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses)
WITH RECURSIVE n(i) AS (SELECT 3 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
SELECT printf('fx-a-rs-%04d', i), 'fx-user-a', 'league', 'rank', 1790000000000 - i * 60000,
       'solo', 'SILVER', 'II', i % 100, i, i
FROM n;
-- Tied latest: same captured_at; id DESC picks fx-a-rs-tie-2 (PLATINUM).
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses) VALUES
  ('fx-a-rs-tie-1', 'fx-user-a', 'league', 'rank', 1789999880000, 'solo', 'GOLD', 'I', 10, 50, 40),
  ('fx-a-rs-tie-2', 'fx-user-a', 'league', 'rank', 1789999880000, 'solo', 'PLATINUM', 'IV', 20, 51, 40),
  ('fx-a-rf-0001', 'fx-user-a', 'league', 'rank', 1789990000000, 'flex', 'BRONZE', 'III', 30, 5, 6),
  ('fx-a-rf-0002', 'fx-user-a', 'league', 'rank', 1789980000000, 'flex', 'IRON', 'I', 0, 4, 6),
  ('fx-a-rf-0003', 'fx-user-a', 'league', 'rank', 1789970000000, 'flex', NULL, NULL, NULL, NULL, NULL);

-- A: 86 matches every 7.9h (28440000 ms), n = 1..86; win cycles 1, 0, NULL, 2.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 86)
SELECT printf('fx-a-m-%04d', i), 'fx-user-a', 'league', 'match', 1790000000000 - i * 28440000,
       printf('NA1_%d', 9000 + i),
       CASE i % 3 WHEN 0 THEN 'Ahri' WHEN 1 THEN 'Garen' ELSE NULL END,
       CASE i % 2 WHEN 0 THEN 'MIDDLE' ELSE 'TOP' END,
       CASE i % 6 WHEN 0 THEN 420 WHEN 1 THEN 440 WHEN 2 THEN 450 WHEN 3 THEN 400 WHEN 4 THEN 1700 ELSE NULL END,
       CASE i % 4 WHEN 0 THEN 1 WHEN 1 THEN 0 WHEN 2 THEN NULL ELSE 2 END,
       i % 11, i % 7, i % 13, 100 + i, 1500 + i, CASE WHEN i % 5 = 0 THEN NULL ELSE 40 + i % 50 END
FROM n;
-- Boundary rows: exactly T0 - 7d and 1 ms before it, exactly T0 and 1 ms after it.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score) VALUES
  ('fx-a-b-7d',      'fx-user-a', 'league', 'match', 1789395200000, 'NA1_7D',      'Lux', 'UTILITY', 420, 1, 1, 1, 1, 10, 1000, 50),
  ('fx-a-b-7d-1ms',  'fx-user-a', 'league', 'match', 1789395199999, 'NA1_7D_1MS',  'Lux', 'UTILITY', 420, 1, 2, 2, 2, 20, 1001, 51),
  ('fx-a-b-t0',      'fx-user-a', 'league', 'match', 1790000000000, 'NA1_T0',      'Lux', 'UTILITY', 440, 0, 3, 3, 3, 30, 1002, 52),
  ('fx-a-b-t0+1ms',  'fx-user-a', 'league', 'match', 1790000000001, 'NA1_T0_1MS',  'Lux', 'UTILITY', 440, 1, 4, 4, 4, 40, 1003, 53);
-- Payload order: T0+1ms, T0, n = 1..21, T0-7d, T0-7d-1ms, n = 22..86 — so n sits at
-- position n + 2 for n <= 21 and n + 4 for n >= 22.
-- Tied pair at positions 10-11 (n = 8, 9): id DESC puts fx-a-m-0009 first.
UPDATE gaming_snapshots SET captured_at = 1790000000000 - 8 * 28440000 WHERE id = 'fx-a-m-0009';
-- Tied pair straddling the cutoff at positions 60-61 (n = 56, 57): fx-a-m-0057 is
-- row 60 and included; fx-a-m-0056 is row 61 and excluded.
UPDATE gaming_snapshots SET captured_at = 1790000000000 - 56 * 28440000 WHERE id = 'fx-a-m-0057';

-- B: flex rank only, 5 recent matches.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses) VALUES
  ('fx-b-rf-0001', 'fx-user-b', 'league', 'rank', 1789999000000, 'flex', 'GOLD', 'II', 44, 9, 9);
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5)
SELECT printf('fx-b-m-%04d', i), 'fx-user-b', 'league', 'match', 1790000000000 - i * 3600000,
       printf('NA1_B%d', i), 'Jinx', 'BOTTOM', 440, i % 2, 5, 5, 5, 200, 1800, 60
FROM n;

-- D: solo rank; matches only older than 30 days.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses) VALUES
  ('fx-d-rs-0001', 'fx-user-d', 'league', 'rank', 1789999000000, 'solo', 'DIAMOND', 'I', 75, 100, 90);
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 3)
SELECT printf('fx-d-m-%04d', i), 'fx-user-d', 'league', 'match', 1790000000000 - 30 * 86400000 - i,
       printf('NA1_D%d', i), 'Zed', 'MIDDLE', 420, 1, 9, 1, 3, 250, 1700, 80
FROM n;

-- E: solo rank; 7-day matches all NULL win, plus one 10-day-old win.
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, queue_type, tier, division, league_points, wins, losses) VALUES
  ('fx-e-rs-0001', 'fx-user-e', 'league', 'rank', 1789999000000, 'solo', 'MASTER', NULL, 120, 200, 150);
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 4)
SELECT printf('fx-e-m-%04d', i), 'fx-user-e', 'league', 'match', 1790000000000 - i * 86400000,
       printf('NA1_E%d', i), 'Thresh', 'UTILITY', 450, NULL, 0, 0, 0, 0, 0, 0
FROM n;
INSERT INTO gaming_snapshots (id, user_id, game, kind, captured_at, match_id, champion, position, queue_id, win, kills, deaths, assists, cs, duration_sec, score) VALUES
  ('fx-e-m-old', 'fx-user-e', 'league', 'match', 1789136000000, 'NA1_E_OLD', 'Thresh', 'UTILITY', 450, 1, 1, 1, 1, 1, 1, 1);

-- Notifications: 300 for A alternating lab / trailhead, 100 lab for B.
INSERT INTO notifications (id, user_id, source, kind, external_id, title, priority, published_at, status, created_at)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 300)
SELECT printf('fx-a-n-%04d', i), 'fx-user-a', CASE i % 2 WHEN 0 THEN 'lab' ELSE 'trailhead' END,
       'alert', printf('fx-a-ext-%04d', i), printf('Fixture A %d', i), 3,
       1790000000000 - i * 60000, CASE i % 3 WHEN 0 THEN 'read' ELSE 'unread' END, 1790000000000
FROM n;
INSERT INTO notifications (id, user_id, source, kind, external_id, title, priority, published_at, status, created_at)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 100)
SELECT printf('fx-b-n-%04d', i), 'fx-user-b', 'lab', 'alert', printf('fx-b-ext-%04d', i),
       printf('Fixture B %d', i), 3, 1790000000000 - i * 60000, 'unread', 1790000000000
FROM n;
