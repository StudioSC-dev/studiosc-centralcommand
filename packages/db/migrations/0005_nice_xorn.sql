CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`priority` text DEFAULT 'med' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'native' NOT NULL,
	`external_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
