CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT '截止提醒' NOT NULL,
	`target_id` text,
	`title` text NOT NULL,
	`trigger_at` text,
	`lead_days` text DEFAULT '[7,3,1,0]' NOT NULL,
	`priority` text DEFAULT '普通' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `application_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT '简历' NOT NULL,
	`version` text DEFAULT 'V1' NOT NULL,
	`status` text DEFAULT '可用' NOT NULL,
	`last_modified_at` text,
	`object_key` text,
	`filename` text,
	`content_type` text,
	`size` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_documents_object_key_unique` ON `application_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `application_documents_application_idx` ON `application_documents` (`application_id`);--> statement-breakpoint
CREATE TABLE `application_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text DEFAULT '网申' NOT NULL,
	`title` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`place` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`reminder_days` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT '待完成' NOT NULL,
	`schedule_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_events_start_idx` ON `application_events` (`start_at`);--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`kind` text DEFAULT '新闻' NOT NULL,
	`category` text DEFAULT '科技与AI' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`importance` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`source_name` text DEFAULT '' NOT NULL,
	`published_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`event_status` text DEFAULT '待确认' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`official_confirmed` integer DEFAULT false NOT NULL,
	`independent_sources` integer DEFAULT 1 NOT NULL,
	`unconfirmed` text DEFAULT '' NOT NULL,
	`read_status` text DEFAULT '未读' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_ignored` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `feed_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feed_items_updated_idx` ON `feed_items` (`updated_at`);--> statement-breakpoint
CREATE INDEX `feed_items_category_idx` ON `feed_items` (`category`);--> statement-breakpoint
CREATE TABLE `feed_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text DEFAULT '新闻' NOT NULL,
	`authority` text DEFAULT '媒体' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`check_frequency` text DEFAULT '每日' NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`status` text DEFAULT '待了解' NOT NULL,
	`applied_at` text,
	`next_action` text DEFAULT '' NOT NULL,
	`next_action_at` text,
	`resume_version` text DEFAULT '' NOT NULL,
	`material_completeness` integer DEFAULT 0 NOT NULL,
	`missing_materials` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_applications_posting_unique` ON `job_applications` (`posting_id`);--> statement-breakpoint
CREATE INDEX `job_applications_status_idx` ON `job_applications` (`status`);--> statement-breakpoint
CREATE TABLE `job_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`kind` text DEFAULT '页面变化' NOT NULL,
	`summary` text NOT NULL,
	`before_text` text DEFAULT '' NOT NULL,
	`after_text` text DEFAULT '' NOT NULL,
	`detected_at` text NOT NULL,
	`is_important` integer DEFAULT false NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_changes_posting_idx` ON `job_changes` (`posting_id`);--> statement-breakpoint
CREATE TABLE `job_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT '银行' NOT NULL,
	`level` text DEFAULT '总行' NOT NULL,
	`official_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`title` text NOT NULL,
	`recruitment_batch` text DEFAULT '秋招' NOT NULL,
	`organization_level` text DEFAULT '总行' NOT NULL,
	`region` text DEFAULT '全国' NOT NULL,
	`education` text DEFAULT '硕士' NOT NULL,
	`majors` text DEFAULT '' NOT NULL,
	`open_at` text,
	`deadline_at` text,
	`source_url` text DEFAULT '' NOT NULL,
	`opening_status` text DEFAULT '信息待确认' NOT NULL,
	`last_checked_at` text,
	`last_change` text DEFAULT '' NOT NULL,
	`source_confirmed` integer DEFAULT false NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`match_level` text DEFAULT '待评估' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `job_organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_postings_deadline_idx` ON `job_postings` (`deadline_at`);--> statement-breakpoint
CREATE INDEX `job_postings_status_idx` ON `job_postings` (`opening_status`);--> statement-breakpoint
CREATE TABLE `job_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`page_title` text DEFAULT '' NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`checked_at` text NOT NULL,
	`http_status` integer DEFAULT 200 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_snapshots_posting_idx` ON `job_snapshots` (`posting_id`);--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text DEFAULT '岗位' NOT NULL,
	`target_id` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text DEFAULT '进行中' NOT NULL,
	`checked_count` integer DEFAULT 0 NOT NULL,
	`changed_count` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitor_runs_started_idx` ON `monitor_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `paper_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`review_score` text DEFAULT '未公开' NOT NULL,
	`acceptance_status` text DEFAULT '未公开' NOT NULL,
	`venue_level` text DEFAULT '' NOT NULL,
	`heat_signal` text DEFAULT '' NOT NULL,
	`citations` integer DEFAULT 0 NOT NULL,
	`benchmark_signal` text DEFAULT '' NOT NULL,
	`code_available` integer DEFAULT false NOT NULL,
	`model_available` integer DEFAULT false NOT NULL,
	`data_available` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `research_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `paper_signals_paper_idx` ON `paper_signals` (`paper_id`);--> statement-breakpoint
CREATE TABLE `research_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`published_at` text,
	`paper_url` text DEFAULT '' NOT NULL,
	`code_url` text DEFAULT '' NOT NULL,
	`project_url` text DEFAULT '' NOT NULL,
	`research_question` text DEFAULT '' NOT NULL,
	`innovation` text DEFAULT '' NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`datasets` text DEFAULT '' NOT NULL,
	`results` text DEFAULT '' NOT NULL,
	`limitations` text DEFAULT '' NOT NULL,
	`relevance` integer DEFAULT 0 NOT NULL,
	`reproducibility` text DEFAULT '待判断' NOT NULL,
	`reading_status` text DEFAULT '新发现' NOT NULL,
	`related_project` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_papers_status_idx` ON `research_papers` (`reading_status`);--> statement-breakpoint
CREATE INDEX `research_papers_published_idx` ON `research_papers` (`published_at`);--> statement-breakpoint
CREATE TABLE `topic_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT '主题' NOT NULL,
	`value` text NOT NULL,
	`scope` text DEFAULT '全部' NOT NULL,
	`priority` text DEFAULT '普通' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_subscriptions_kind_value_unique` ON `topic_subscriptions` (`kind`,`value`);