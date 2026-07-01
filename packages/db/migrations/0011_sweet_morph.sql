CREATE TABLE `calendar_channels` (
	`user_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`token` text NOT NULL,
	`expiration` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_channels_channel_id_unique` ON `calendar_channels` (`channel_id`);