CREATE TABLE `schedule_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`occurrence_start` text NOT NULL,
	`reason` text DEFAULT '取消本次' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedule_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_exceptions_schedule_start_unique` ON `schedule_exceptions` (`schedule_id`,`occurrence_start`);