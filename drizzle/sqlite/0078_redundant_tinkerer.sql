PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__keep_vercel_audit_edges` AS SELECT * FROM `vercel_audit_edges`;--> statement-breakpoint
CREATE TABLE `__keep_vercel_audit_frontier` AS SELECT * FROM `vercel_audit_frontier`;--> statement-breakpoint
CREATE TABLE `__keep_vercel_audit_pages` AS SELECT * FROM `vercel_audit_pages`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vercel_audit_scratchpads` (
	`audit_id` text PRIMARY KEY NOT NULL,
	`throttle_text` text,
	`graph_complete` integer DEFAULT 1 NOT NULL,
	`edge_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vercel_audit_scratchpads`("audit_id", "throttle_text", "graph_complete", "edge_count", "expires_at") SELECT "audit_id", "throttle_text", "graph_complete", "edge_count", "expires_at" FROM `vercel_audit_scratchpads`;--> statement-breakpoint
DROP TABLE `vercel_audit_scratchpads`;--> statement-breakpoint
ALTER TABLE `__new_vercel_audit_scratchpads` RENAME TO `vercel_audit_scratchpads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `vercel_scratchpad_expiry_idx` ON `vercel_audit_scratchpads` (`expires_at`);
INSERT OR REPLACE INTO `vercel_audit_edges` SELECT * FROM `__keep_vercel_audit_edges`;--> statement-breakpoint
DROP TABLE `__keep_vercel_audit_edges`;--> statement-breakpoint
INSERT OR REPLACE INTO `vercel_audit_frontier` SELECT * FROM `__keep_vercel_audit_frontier`;--> statement-breakpoint
DROP TABLE `__keep_vercel_audit_frontier`;--> statement-breakpoint
INSERT OR REPLACE INTO `vercel_audit_pages` SELECT * FROM `__keep_vercel_audit_pages`;--> statement-breakpoint
DROP TABLE `__keep_vercel_audit_pages`;--> statement-breakpoint
