-- docs/ui-suite.md D15 — the three layout JSON columns become rows.
--
-- Order matters: backfill BEFORE the drops, in one migration, so there is never
-- a moment where the layout exists in neither place. The three inserts are
-- separate because each column answers a different third of the same question
-- and a card can appear in one, two or all three; ON CONFLICT merges them onto
-- the single row per (user, card) the table is keyed by.
--
-- Every read of a stored blob is wrapped in `json_valid` — the read path in
-- services/dashboard.ts has always been lenient about malformed JSON, and a
-- migration that throws on a row the app tolerated would be a strictly worse
-- reader than the code it replaces.
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
-- Hidden: a JSON array of CardKeys. `j.value` is the key.
INSERT INTO `dashboard_cards` (`user_id`, `card`, `hidden`, `updated_at`)
SELECT s.user_id, j.value, 1, s.updated_at
FROM `user_settings` s,
     json_each(CASE WHEN json_valid(s.hidden_cards) THEN s.hidden_cards ELSE '[]' END) j
WHERE json_type(j.value) = 'text'
ON CONFLICT(`user_id`, `card`) DO UPDATE SET `hidden` = 1;--> statement-breakpoint
-- Order: a JSON array of CardKeys. `j.key` is the array index, which is exactly
-- the sparse sort key `position` holds — keys present sort by it, keys absent
-- fall in afterwards in registry order, which is what resolveCardOrder() did to
-- the array.
INSERT INTO `dashboard_cards` (`user_id`, `card`, `position`, `updated_at`)
SELECT s.user_id, j.value, j.key, s.updated_at
FROM `user_settings` s,
     json_each(CASE WHEN json_valid(s.card_order) THEN s.card_order ELSE '[]' END) j
WHERE json_type(j.value) = 'text'
ON CONFLICT(`user_id`, `card`) DO UPDATE SET `position` = excluded.`position`;--> statement-breakpoint
-- Sizes: a JSON *object* of CardKey → CardSize, so here `j.key` is the card.
INSERT INTO `dashboard_cards` (`user_id`, `card`, `size`, `updated_at`)
SELECT s.user_id, j.key, j.value, s.updated_at
FROM `user_settings` s,
     json_each(CASE WHEN json_valid(s.card_sizes) THEN s.card_sizes ELSE '{}' END) j
WHERE json_type(j.value) = 'text'
ON CONFLICT(`user_id`, `card`) DO UPDATE SET `size` = excluded.`size`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `hidden_cards`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `card_order`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `card_sizes`;