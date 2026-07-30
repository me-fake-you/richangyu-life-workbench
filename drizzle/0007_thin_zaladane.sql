CREATE TABLE `photo_metadata` (
	`media_id` text PRIMARY KEY NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`taken_at` text,
	`place` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`album` text DEFAULT '' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`cover_date` text,
	`hidden_from_memories` integer DEFAULT false NOT NULL,
	`vision_provider` text DEFAULT '' NOT NULL,
	`vision_model` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_metadata_taken_at_idx` ON `photo_metadata` (`taken_at`);--> statement-breakpoint
CREATE INDEX `photo_metadata_cover_date_idx` ON `photo_metadata` (`cover_date`);--> statement-breakpoint
CREATE TABLE `photo_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`cover_media_id` text,
	`content` text NOT NULL,
	`media_ids` text DEFAULT '[]' NOT NULL,
	`generated_by` text DEFAULT 'local' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_stories_period_unique` ON `photo_stories` (`period_start`,`period_end`);