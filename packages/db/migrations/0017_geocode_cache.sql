-- Geocode cache for the Today card's "leave by" estimate.
--
-- WHY D1 AND NOT KV. KV is the binding constraint on this project (1,000 writes
-- /day, ~630 already spoken for — see CLAUDE.md "KV Write Budget"), and a newly
-- seen event location is exactly a per-miss write. D1's free tier is 100k
-- writes/day, so the cache lives here and costs the KV budget nothing.
--
-- NOT USER-SCOPED, DELIBERATELY. "Cafe Mura, Manila" resolves to the same point
-- for everyone, so keying by user would multiply identical rows and identical
-- ORS calls. No user id is stored, so this holds no personal data — only the
-- public fact that a place name maps to a coordinate. One user's lookup warms
-- the cache for the next, which is the whole point.
--
-- MISSES ARE CACHED TOO (`resolved = 0`). An unresolvable location — a room
-- name, a typo, a building nobody has mapped — would otherwise be re-asked on
-- every calendar cache miss, forever, burning the ORS daily quota on a question
-- whose answer will not change. `stale_after` is what lets a miss be retried
-- eventually without retrying it constantly.
CREATE TABLE `geocode_cache` (
	-- The lookup string, lowercased and whitespace-collapsed by normaliseQuery()
	-- so trivial spelling differences share a row.
	`query` text PRIMARY KEY NOT NULL,
	-- Null when `resolved` is 0.
	`lat` real,
	`lon` real,
	-- What the geocoder called the place; used to name a leg's origin.
	`label` text,
	-- 0/1. SQLite has no boolean, and this matches dashboard_cards.hidden.
	`resolved` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	-- Epoch ms after which this row should be looked up again. Hits are given a
	-- long life (places rarely move); misses a short one, so a location that
	-- becomes resolvable is picked up without being hammered meanwhile.
	`stale_after` integer NOT NULL
);
--> statement-breakpoint
-- The read path is "give me every row that is still fresh for these queries",
-- so the primary key alone would force a scan to evaluate freshness.
CREATE INDEX `geocode_cache_stale_after_idx` ON `geocode_cache` (`stale_after`);
