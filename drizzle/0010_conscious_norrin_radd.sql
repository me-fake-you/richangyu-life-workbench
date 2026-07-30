CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`device_id` text DEFAULT '' NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `client_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text DEFAULT '' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`base_revision` integer DEFAULT 0 NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'processed' NOT NULL,
	`result_revision` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `client_mutations_device_created_idx` ON `client_mutations` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `client_mutations_status_idx` ON `client_mutations` (`status`);--> statement-breakpoint
CREATE TABLE `life_event_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`change_note` text DEFAULT '' NOT NULL,
	`device_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `life_event_versions_event_revision_unique` ON `life_event_versions` (`event_id`,`revision`);--> statement-breakpoint
CREATE INDEX `life_event_versions_created_idx` ON `life_event_versions` (`created_at`);--> statement-breakpoint
CREATE TABLE `record_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`device_id` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `record_drafts_updated_idx` ON `record_drafts` (`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `record_drafts_event_device_unique` ON `record_drafts` (`event_id`,`device_id`);--> statement-breakpoint
ALTER TABLE `life_events` ADD `record_status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `life_events` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `life_events` ADD `updated_at` text DEFAULT '' NOT NULL;
