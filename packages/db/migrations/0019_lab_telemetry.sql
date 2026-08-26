-- Homelab telemetry — see ../integrations/homelab-telemetry.md
--
-- NOTE FOR ANYONE READING THE CONTRACT ALONGSIDE THIS: that document specifies
-- three tables, `lab_sources`, `lab_snapshots` and `lab_events`. Only the first
-- two are built. Lab EVENTS land in the `notifications` spine (migration 0018)
-- with `source = 'lab'`, because events from the lab are the same kind of thing
-- as unread mail and Slack mentions and belong on the same card. The agent's
-- wire format is unchanged — where the rows land is a consumer-side decision,
-- exactly as D6 says selection is.

-- One row per push-capable agent.
--
-- The token is the agent's whole identity, and it belongs to the STACK, not the
-- machine (D3): the same token keeps working after the homelab moves to Linux,
-- so a host change is not a re-registration.
CREATE TABLE `lab_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	-- ONLY the SHA-256 hash, and it carries the unique index below — so
	-- verifying a presented token is "hash it, look it up", and no secret is
	-- ever compared byte-by-byte in app code. Rotation overwrites this in place;
	-- revocation is a row delete. Both are first-class operations (risk 4).
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`rotated_at` integer,
	-- The dead-man's switch. Everything the card says about freshness is
	-- computed server-side from this column (risk 6). Silence looking like
	-- health is the exact failure this whole integration exists to fix.
	`last_seen_at` integer,
	`agent_version` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_sources_token_hash_idx` ON `lab_sources` (`token_hash`);
--> statement-breakpoint
-- LATEST ONLY. The primary key is the source, so every push is a single-row
-- upsert rather than an append (risk 3): at a 60s cadence an append would be
-- 1,440 rows/day/source of history nobody asked for. No snapshot history table
-- until the card actually wants sparklines.
CREATE TABLE `lab_snapshots` (
	`source_id` text PRIMARY KEY NOT NULL,
	-- Payload schema version, so the consumer can reject nonsense and the shape
	-- can evolve without a flag day.
	`version` integer NOT NULL,
	-- When the agent measured, vs when we accepted it. Both are needed: a push
	-- that arrives late is fresh data, a push that stops arriving is not.
	`captured_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	-- The section map, verbatim JSON. Not normalised into columns because the
	-- producer is deliberately dumb (D6) — it pushes full monitor detail and the
	-- CONSUMER decides what to display, so the display shape can change without
	-- a migration and without redeploying a container on the homelab.
	`sections` text NOT NULL,
	`agent_version` text,
	FOREIGN KEY (`source_id`) REFERENCES `lab_sources`(`id`) ON UPDATE no action ON DELETE no action
);
