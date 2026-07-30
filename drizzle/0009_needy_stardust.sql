CREATE TABLE `automation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text DEFAULT 'reminder' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`action_target` text DEFAULT '' NOT NULL,
	`due_at` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_messages_run_unique` ON `automation_messages` (`run_id`);--> statement-breakpoint
CREATE INDEX `automation_messages_unread_idx` ON `automation_messages` (`read_at`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`run_key` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`scheduled_for` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`outcome_json` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_runs_key_unique` ON `automation_runs` (`automation_id`,`run_key`);--> statement-breakpoint
CREATE INDEX `automation_runs_started_idx` ON `automation_runs` (`started_at`);