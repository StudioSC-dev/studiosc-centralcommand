-- Shared push-ingest credentials — see ../../../integrations/trailhead-inbox.md D7.
--
-- `lab_sources` is deliberately NOT generalised into this table. It is live in
-- production with an agent pushing every 60s, and `lab_snapshots.source_id`
-- carries an FK onto it, so a rename is blast radius for no functional gain.
-- Lab moves here only if it is ever opened for its own reasons.
--
-- Only the SHA-256 hash is stored and it carries the unique index below, so
-- verifying a presented token is "hash it, look it up" and no secret is ever
-- compared byte-by-byte in app code — the same property as lab_sources, and the
-- consumer-side reading of D7's "constant-time compare".
CREATE TABLE `ingest_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	-- The spine `source` this credential may write, and the ONLY one: the
	-- middleware refuses a token whose source does not match the route, so a
	-- leaked trailhead token cannot post lab telemetry.
	`source` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`rotated_at` integer,
	-- "When did we last hear from this producer", for operators only. NOTHING
	-- derives health from it for trailhead: that source has no push cadence, so
	-- silence is normal (trailhead-inbox D6) and `notification_sources.state`
	-- stays 'ok' for it forever.
	`last_seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingest_sources_token_hash_idx` ON `ingest_sources` (`token_hash`);
--> statement-breakpoint
-- One credential per (user, source). Rotation overwrites the hash in place, so
-- this also rules out by construction the ambiguity that `labSourceForUser`
-- carries (services/lab.ts:114-117: a user-only `.get()` over many rows).
CREATE UNIQUE INDEX `ingest_sources_user_source_idx` ON `ingest_sources` (`user_id`,`source`);
