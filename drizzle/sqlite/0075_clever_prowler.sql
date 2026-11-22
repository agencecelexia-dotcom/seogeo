CREATE TABLE `workbench_discovery_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`authorized_by_user_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`target_url` text NOT NULL,
	`next_run_at` text NOT NULL,
	`last_run_at` text,
	`last_outcome` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorized_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workbench_discovery_due_idx` ON `workbench_discovery_settings` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `audit_schedules` (
	`project_id` text PRIMARY KEY NOT NULL,
	`authorized_by_user_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`max_pages` integer DEFAULT 1000 NOT NULL,
	`next_run_at` text NOT NULL,
	`last_run_at` text,
	`last_outcome` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorized_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `monitoring_source_states` ADD `refresh_cycle_date` text;