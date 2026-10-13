-- Index for the per-source notifications feed. `recentFromSource` filters
-- `user_id` + `source` and orders by `published_at`; with only
-- `notifications_feed_idx (user_id, status, published_at)` it read ~374 rows
-- per call. Hand-written — drizzle metadata stops at 0016, do not run
-- `drizzle-kit generate`.
CREATE INDEX IF NOT EXISTS `notifications_source_feed_idx` ON `notifications` (`user_id`,`source`,`published_at`);
