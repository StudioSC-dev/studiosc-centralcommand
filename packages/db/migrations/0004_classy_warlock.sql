ALTER TABLE `gaming_providers` ADD `region` text;--> statement-breakpoint
ALTER TABLE `gaming_providers` ADD `puuid` text;--> statement-breakpoint
ALTER TABLE `gaming_providers` ADD `summoner_id` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `game` text NOT NULL;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `kind` text NOT NULL;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `match_id` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `champion` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `position` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `queue_id` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `win` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `kills` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `deaths` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `assists` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `cs` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `duration_sec` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `score` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `queue_type` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `tier` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `division` text;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `league_points` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `wins` integer;--> statement-breakpoint
ALTER TABLE `gaming_snapshots` ADD `losses` integer;