CREATE TABLE `private_vault_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`credential_hash` text NOT NULL,
	`salt` text NOT NULL,
	`lock_timeout_minutes` integer DEFAULT 30 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
