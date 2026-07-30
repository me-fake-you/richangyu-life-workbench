CREATE TABLE `finance_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_budgets_month_category_unique` ON `finance_budgets` (`month`,`category`);--> statement-breakpoint
CREATE TABLE `finance_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text,
	`settlement_id` text,
	`kind` text DEFAULT '票据' NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_documents_object_key_unique` ON `finance_documents` (`object_key`);--> statement-breakpoint
CREATE TABLE `finance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'simple' NOT NULL,
	`mask_amounts` integer DEFAULT false NOT NULL,
	`show_in_timeline` text DEFAULT 'summary' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT '支出' NOT NULL,
	`amount` real NOT NULL,
	`category` text DEFAULT '其他' NOT NULL,
	`account_id` text,
	`transfer_account_id` text,
	`project` text DEFAULT '' NOT NULL,
	`side_hustle_project_id` text,
	`work_session_id` text,
	`receivable_id` text,
	`occurred_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_private` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`side_hustle_project_id`) REFERENCES `side_hustle_projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finance_transactions_occurred_idx` ON `finance_transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `finance_transactions_account_idx` ON `finance_transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_side_project_idx` ON `finance_transactions` (`side_hustle_project_id`);--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT '现金' NOT NULL,
	`color` text DEFAULT '#76528b' NOT NULL,
	`initial_balance` real DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`client_id` text,
	`work_session_id` text,
	`amount_due` real DEFAULT 0 NOT NULL,
	`amount_received` real DEFAULT 0 NOT NULL,
	`due_at` text,
	`status` text DEFAULT '待结算' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `side_hustle_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `side_hustle_clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `receivables_project_idx` ON `receivables` (`project_id`);--> statement-breakpoint
CREATE INDEX `receivables_status_idx` ON `receivables` (`status`);--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT '支出' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`category` text DEFAULT '订阅服务' NOT NULL,
	`account_id` text,
	`frequency` text DEFAULT '每月' NOT NULL,
	`next_at` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`target_amount` real DEFAULT 0 NOT NULL,
	`saved_amount` real DEFAULT 0 NOT NULL,
	`target_at` text,
	`color` text DEFAULT '#76528b' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`receivable_id` text NOT NULL,
	`account_id` text,
	`transaction_id` text,
	`amount` real NOT NULL,
	`received_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `settlements_receivable_idx` ON `settlements` (`receivable_id`);--> statement-breakpoint
CREATE TABLE `side_hustle_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`payment_habit` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`next_follow_up_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `side_hustle_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT '兼职' NOT NULL,
	`client_id` text,
	`billing_mode` text DEFAULT '按小时' NOT NULL,
	`unit_rate` real DEFAULT 0 NOT NULL,
	`settlement_cycle` text DEFAULT '每次结束' NOT NULL,
	`status` text DEFAULT '进行中' NOT NULL,
	`income_target` real DEFAULT 0 NOT NULL,
	`start_at` text,
	`note` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#477c6a' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `side_hustle_clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `side_hustle_projects_client_idx` ON `side_hustle_projects` (`client_id`);--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`schedule_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`minutes` integer DEFAULT 0 NOT NULL,
	`hidden_minutes` integer DEFAULT 0 NOT NULL,
	`paused_at` text,
	`paused_minutes` integer DEFAULT 0 NOT NULL,
	`work_content` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`expected_income` real DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`feeling` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '进行中' NOT NULL,
	`life_event_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `side_hustle_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`life_event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `work_sessions_project_idx` ON `work_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_sessions_started_idx` ON `work_sessions` (`started_at`);