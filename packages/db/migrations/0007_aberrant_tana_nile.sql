ALTER TABLE `sleep_logs` ADD `hrv` integer;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `units` text;--> statement-breakpoint
ALTER TABLE `weather_snapshots` ADD `date` text;--> statement-breakpoint
ALTER TABLE `weather_snapshots` ADD `temp_c` real;--> statement-breakpoint
ALTER TABLE `weather_snapshots` ADD `condition` text;--> statement-breakpoint
ALTER TABLE `weather_snapshots` ADD `rain_1h` real;--> statement-breakpoint
CREATE UNIQUE INDEX `weather_snapshots_user_id_date_unique` ON `weather_snapshots` (`user_id`,`date`);