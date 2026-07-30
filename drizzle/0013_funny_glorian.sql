CREATE TABLE `ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'question' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`start_at` text,
	`end_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_tasks_status_created_idx` ON `ai_tasks` (`status`,`created_at`);