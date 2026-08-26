-- The notifications spine — one table, every source.
--
-- WHY A SPINE AND NOT A CARD. Notifications are a workstream, not a pillar: the
-- homelab's ntfy bus is the first producer, Gmail and Slack follow, and the
-- delivery channels (the card today; web push and native toasts later) all read
-- the same rows. A table per source would make each new source a migration and
-- each new delivery channel a fan-in query over N tables.
--
-- `source` is plain TEXT with no CHECK constraint, deliberately. Adding Gmail
-- should be a collector, not a schema change.
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	-- 'lab' | 'gmail' | 'slack' | … — see docs/notifications.md
	`source` text NOT NULL,
	-- Source-specific: 'alert' for the lab, 'mention'/'message' for chat.
	`kind` text DEFAULT 'alert' NOT NULL,
	-- The producer's own id — an ntfy message id for `lab`. This is what makes
	-- ingest idempotent: ntfy delivery is at-least-once across reconnects, so the
	-- consumer dedupes rather than trusting the stream. Nullable, because a
	-- source with no stable id still gets rows.
	`external_id` text,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	-- ntfy's 1–5 scale, carried through rather than remapped.
	`priority` integer DEFAULT 3 NOT NULL,
	`tags` text,
	`published_at` integer NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	-- Ships with no UI. It is in the recorded Zero Inbox design, costs nothing
	-- now, and adding it later is a migration.
	`snooze_until` integer,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Dedup key for insert-or-ignore. Scoped by user as well as source, because two
-- users' labs are two independent streams that may reuse message ids.
CREATE UNIQUE INDEX `notifications_source_external_idx` ON `notifications` (`user_id`,`source`,`external_id`);
--> statement-breakpoint
-- The card's only read: this user's unread feed, newest first.
CREATE INDEX `notifications_feed_idx` ON `notifications` (`user_id`,`status`,`published_at`);
--> statement-breakpoint
-- One row per (user, source): the card's badge row, and the only place a
-- count-only source can live.
--
-- WHY THIS IS NOT DERIVED FROM THE FEED. "All ntfy notifications" is a feed —
-- real rows, each read or dismissed individually. "Unread emails: 12" is a
-- counter; Gmail is never going to write four thousand rows into `notifications`
-- and a card that assumes it will gets rebuilt the day Gmail lands.
--
-- `unread_count` is nullable with a specific meaning: NULL → derive it from the
-- feed (what `lab` does), a number → the collector reported it (what Gmail and
-- Slack will do). The read path is COALESCE over the two.
CREATE TABLE `notification_sources` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`label` text NOT NULL,
	`unread_count` integer,
	`last_event_at` integer,
	`last_sync_at` integer,
	-- 'ok' | 'stale' | 'error' — a source that has stopped reporting must be
	-- distinguishable from a source with nothing to report.
	`state` text DEFAULT 'ok' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
