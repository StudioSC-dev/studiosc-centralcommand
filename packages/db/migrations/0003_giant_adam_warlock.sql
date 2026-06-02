ALTER TABLE `performance_scores` ADD `date` text;--> statement-breakpoint
ALTER TABLE `performance_scores` ADD `sleep_score` integer;--> statement-breakpoint
ALTER TABLE `performance_scores` ADD `nutrition_score` integer;--> statement-breakpoint
ALTER TABLE `performance_scores` ADD `hrv_score` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `performance_scores_user_id_date_unique` ON `performance_scores` (`user_id`,`date`);