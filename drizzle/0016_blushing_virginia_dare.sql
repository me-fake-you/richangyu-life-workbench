CREATE TABLE `device_sessions` (
	`device_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '未命名设备' NOT NULL,
	`platform` text DEFAULT '未知' NOT NULL,
	`app_version` text DEFAULT '' NOT NULL,
	`standalone` integer DEFAULT false NOT NULL,
	`notification_permission` text DEFAULT 'default' NOT NULL,
	`pending_count` integer DEFAULT 0 NOT NULL,
	`conflict_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE INDEX `device_sessions_last_seen_idx` ON `device_sessions` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `feed_source_health` (
	`source_id` text PRIMARY KEY NOT NULL,
	`last_success_at` text,
	`last_failure_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`image_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `feed_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feed_source_health_updated_idx` ON `feed_source_health` (`updated_at`);--> statement-breakpoint
CREATE TABLE `meal_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`previous_values_json` text DEFAULT '{}' NOT NULL,
	`corrected_values_json` text DEFAULT '{}' NOT NULL,
	`reason` text DEFAULT '人工校正' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_corrections_meal_created_idx` ON `meal_corrections` (`meal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`device_id` text NOT NULL,
	`status` text DEFAULT 'delivered' NOT NULL,
	`delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`opened_at` text,
	FOREIGN KEY (`message_id`) REFERENCES `automation_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_message_device_unique` ON `notification_deliveries` (`message_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_device_idx` ON `notification_deliveries` (`device_id`);--> statement-breakpoint
CREATE TABLE `nutrition_food_memory` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`portion` text DEFAULT '' NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`correction_count` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nutrition_food_memory_name_idx` ON `nutrition_food_memory` (`name`);