ALTER TABLE `fitness_logs` ADD `activity` text;--> statement-breakpoint
ALTER TABLE `fitness_logs` ADD `duration_min` integer;--> statement-breakpoint
ALTER TABLE `fitness_logs` ADD `intensity` integer;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD `meal` text;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD `calories` integer;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD `protein` integer;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD `carbs` integer;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD `fat` integer;--> statement-breakpoint
ALTER TABLE `sleep_logs` ADD `date` text;--> statement-breakpoint
ALTER TABLE `sleep_logs` ADD `duration_min` integer;--> statement-breakpoint
ALTER TABLE `sleep_logs` ADD `quality` integer;