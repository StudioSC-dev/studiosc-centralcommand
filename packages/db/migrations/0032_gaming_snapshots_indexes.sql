-- Indexes for the gaming reads, which until now had only the primary-key
-- autoindex: every /gaming and /summary request scanned all of a user's
-- snapshots (rank rows accumulate every refresh). Hand-written — drizzle
-- metadata stops at 0016, do not run `drizzle-kit generate`.
--
-- `id` is the tie-break in `ORDER BY captured_at DESC, id DESC`, so the sort is
-- fully index-satisfied (no temp B-tree). `win` makes the win-rate window
-- aggregate covering.
CREATE INDEX IF NOT EXISTS `gaming_snapshots_rank_idx` ON `gaming_snapshots` (`user_id`,`kind`,`queue_type`,`captured_at`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gaming_snapshots_kind_time_idx` ON `gaming_snapshots` (`user_id`,`kind`,`captured_at`,`id`,`win`);
