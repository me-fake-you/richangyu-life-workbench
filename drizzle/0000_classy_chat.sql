CREATE TABLE `collection_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`values` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_rows_collection_idx` ON `collection_rows` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '表' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source_type` text DEFAULT '文字' NOT NULL,
	`status` text DEFAULT '待整理' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_items_status_idx` ON `inbox_items` (`status`);--> statement-breakpoint
CREATE TABLE `life_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT '生活' NOT NULL,
	`mood` text DEFAULT '平静' NOT NULL,
	`energy` integer DEFAULT 3 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`person` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`happened_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `life_events_happened_at_idx` ON `life_events` (`happened_at`);--> statement-breakpoint
CREATE INDEX `life_events_kind_idx` ON `life_events` (`kind`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_object_key_unique` ON `media` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_event_id_idx` ON `media` (`event_id`);--> statement-breakpoint
CREATE TABLE `schedule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '学习' NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`person` text DEFAULT '' NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`repeat_rule` text DEFAULT '不重复' NOT NULL,
	`status` text DEFAULT '计划中' NOT NULL,
	`planned_minutes` integer DEFAULT 0 NOT NULL,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_events_start_at_idx` ON `schedule_events` (`start_at`);