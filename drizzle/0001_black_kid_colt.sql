CREATE TABLE `auth_links` (
	`firebase_uid` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_links_user_id_unique` ON `auth_links` (`user_id`);