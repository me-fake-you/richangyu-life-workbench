CREATE TABLE `task_focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`mode` text DEFAULT 'stopwatch' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	`planned_minutes` integer DEFAULT 25 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_focus_sessions_task_started_idx` ON `task_focus_sessions` (`task_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `task_schedule_links` (
	`task_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedule_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_schedule_links_unique` ON `task_schedule_links` (`task_id`,`schedule_id`);--> statement-breakpoint
CREATE INDEX `task_schedule_links_schedule_idx` ON `task_schedule_links` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '收件箱' NOT NULL,
	`priority` text DEFAULT 'P2' NOT NULL,
	`due_at` text,
	`planned_minutes` integer DEFAULT 25 NOT NULL,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`estimated_pomodoros` integer DEFAULT 1 NOT NULL,
	`completed_pomodoros` integer DEFAULT 0 NOT NULL,
	`today_rank` integer,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_status_due_idx` ON `tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_today_rank_idx` ON `tasks` (`today_rank`);