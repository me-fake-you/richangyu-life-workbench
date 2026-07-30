ALTER TABLE `finance_transactions` ADD `related_transaction_id` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `split_group_id` text;--> statement-breakpoint
CREATE INDEX `finance_transactions_related_idx` ON `finance_transactions` (`related_transaction_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_split_idx` ON `finance_transactions` (`split_group_id`);