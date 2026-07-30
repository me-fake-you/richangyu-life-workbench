CREATE TABLE `sync_preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`device_id` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
