CREATE TABLE `backup_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_type` text NOT NULL,
	`scope` text DEFAULT 'metadata' NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`table_count` integer DEFAULT 0 NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`include_private` integer DEFAULT false NOT NULL,
	`strategy` text DEFAULT 'skip' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_operations_created_at_idx` ON `backup_operations` (`created_at`);