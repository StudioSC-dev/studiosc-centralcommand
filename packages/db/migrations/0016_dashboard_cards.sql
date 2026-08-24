-- docs/ui-suite.md D15 — the three layout JSON columns become rows.
--
-- Order matters: backfill BEFORE the drops, in one migration, so there is never
-- a moment where the layout exists in neither place.
--
-- ⚠️ THE BACKFILL DELIBERATELY USES NO `json_each`. The obvious way to read a
-- JSON array into rows is `FROM user_settings s, json_each(s.hidden_cards)`, and
-- it does not work here: D1 fails any *write* whose SELECT correlates a
-- table-valued json function to an outer table, with `malformed JSON:
-- SQLITE_ERROR`. The identical bare SELECT succeeds, which is what makes it a
-- trap — it looks correct right up until it is wrapped in an INSERT. Verified
-- against the local D1, including the CROSS JOIN and materialised-CTE forms that
-- would normally pin the join order. Scalar JSON functions (`json_valid`,
-- `json_extract`) are unaffected and are what this uses instead.
--
-- A compound `SELECT 'weather' UNION ALL SELECT 'summary' …` was the next
-- attempt and hit D1's compound-SELECT term limit at nine. The recursive CTE
-- below is the third form, and matches what seed-demo.sql already does.
--
-- The nine keys are spelled out because the backfill has to name them somewhere,
-- and doing so makes it write rows only for cards the app actually ships — which
-- is exactly what the lenient read path being retired did anyway.
CREATE TABLE `dashboard_cards` (
	`user_id` text NOT NULL,
	`card` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`position` integer,
	`size` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `card`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- One row per (user, card), built in one pass so the three columns merge onto a
-- single row rather than needing an upsert per column.
--
-- Every read of a stored blob is guarded by `json_valid`: the read path in
-- services/dashboard.ts has always degraded malformed JSON to a default rather
-- than throwing, and a migration that failed on a row the app tolerated would be
-- a strictly worse reader than the code it replaces.
--
-- **`position` is a byte offset, not an array index**, and that is fine on
-- purpose. It is `instr()` of the quoted key within the stored order — which
-- increases with array index, so the sort order is identical, and D15 defines
-- `position` as a sparse *sort key* whose absolute values carry no meaning
-- (ties broken by registry order). The first layout write normalises whatever
-- is here to a dense 0..n via `layoutRows()`. Deriving the true index without
-- `json_each` would have cost far more than it is worth for a value nothing
-- reads except an ORDER BY.
--
-- The outer WHERE is the D4 rule: a row that says nothing — visible, 1x1,
-- registry order — is not written at all, because that is what "no row" means.
WITH RECURSIVE keys(card, rest) AS (
  SELECT '', 'weather,summary,perf,calendar,tasks,health,gaming,insights,news,'
  UNION ALL
  SELECT substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1)
  FROM keys WHERE rest <> ''
)
INSERT INTO `dashboard_cards` (`user_id`, `card`, `hidden`, `position`, `size`, `updated_at`)
SELECT user_id, card, hidden, position, size, updated_at FROM (
  SELECT
    s.user_id AS user_id,
    k.card    AS card,
    CASE WHEN json_valid(s.hidden_cards)
              AND instr(s.hidden_cards, '"' || k.card || '"') > 0
         THEN 1 ELSE 0 END AS hidden,
    CASE WHEN json_valid(s.card_order)
              AND instr(s.card_order, '"' || k.card || '"') > 0
         THEN instr(s.card_order, '"' || k.card || '"') END AS position,
    CASE WHEN json_valid(s.card_sizes)
         THEN json_extract(s.card_sizes, '$."' || k.card || '"') END AS size,
    s.updated_at AS updated_at
  FROM user_settings s
  JOIN keys k ON k.card <> ''
)
WHERE hidden = 1 OR position IS NOT NULL OR size IS NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `hidden_cards`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `card_order`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `card_sizes`;
