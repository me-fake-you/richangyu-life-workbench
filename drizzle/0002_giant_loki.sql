CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_value` text DEFAULT '' NOT NULL,
	`action_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_views` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`view_type` text DEFAULT 'table' NOT NULL,
	`filter_json` text DEFAULT '{}' NOT NULL,
	`sort_json` text DEFAULT '{}' NOT NULL,
	`group_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dashboard_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`layout_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generated_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`generated_by` text DEFAULT 'local' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_summaries_period_unique` ON `generated_summaries` (`kind`,`period_start`,`period_end`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT '已完成' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbox_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`inbox_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inbox_id`) REFERENCES `inbox_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_attachments_object_key_unique` ON `inbox_attachments` (`object_key`);--> statement-breakpoint
CREATE TABLE `life_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`from_event_id` text NOT NULL,
	`to_type` text NOT NULL,
	`to_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`from_event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`name` text NOT NULL,
	`portion` text DEFAULT '' NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_media` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_media_object_key_unique` ON `meal_media` (`object_key`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_type` text DEFAULT '午餐' NOT NULL,
	`eaten_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`estimated_calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`analysis_provider` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meals_eaten_at_idx` ON `meals` (`eaten_at`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`happened_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `nutrition_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`calorie_target` integer DEFAULT 2000 NOT NULL,
	`protein_target` integer DEFAULT 90 NOT NULL,
	`carbs_target` integer DEFAULT 250 NOT NULL,
	`fat_target` integer DEFAULT 65 NOT NULL,
	`water_target` integer DEFAULT 8 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photo_insights` (
	`media_id` text PRIMARY KEY NOT NULL,
	`sha256` text,
	`perceptual_hash` text,
	`blur_score` real,
	`duplicate_of` text,
	`is_screenshot` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`exif_removed` integer DEFAULT false NOT NULL,
	`scanned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_insights_sha_idx` ON `photo_insights` (`sha256`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT '个人目标' NOT NULL,
	`status` text DEFAULT '进行中' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#76528b' NOT NULL,
	`start_at` text,
	`target_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`query_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`occurrence_start` text NOT NULL,
	`occurrence_end` text NOT NULL,
	`status` text DEFAULT '计划中' NOT NULL,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`actual_start_at` text,
	`actual_end_at` text,
	`interruption_reason` text DEFAULT '' NOT NULL,
	`reflection` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedule_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_instances_start_idx` ON `schedule_instances` (`occurrence_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_instances_schedule_start_unique` ON `schedule_instances` (`schedule_id`,`occurrence_start`);--> statement-breakpoint
CREATE TABLE `schedule_rule_settings` (
	`schedule_id` text PRIMARY KEY NOT NULL,
	`repeat_until` text,
	`reminder_minutes` integer DEFAULT 10 NOT NULL,
	`custom_interval` integer DEFAULT 1 NOT NULL,
	`custom_unit` text DEFAULT 'week' NOT NULL,
	`weekdays` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedule_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `water_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`glasses` integer DEFAULT 1 NOT NULL,
	`logged_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
