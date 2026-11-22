CREATE TABLE "backlink_prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"reason" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_source_url" text,
	"draft" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"check_status" text DEFAULT 'unchecked' NOT NULL,
	"check_detail" text,
	"link_rel" text,
	"last_checked_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workbench_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"page_url" text NOT NULL,
	"evidence_url" text,
	"evidence_text" text NOT NULL,
	"recommendation" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"rule_id" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"completed_at" text,
	"verified_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workbench_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"action_id" text,
	"prospect_id" text,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_daily_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source" text NOT NULL,
	"source_property" text NOT NULL,
	"source_time_zone" text NOT NULL,
	"grain" text NOT NULL,
	"date" text NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"clicks" double precision,
	"impressions" double precision,
	"position" double precision,
	"sessions" double precision,
	"key_events" double precision,
	"revenue" double precision,
	"currency_code" text,
	"fetched_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"source_property" text,
	"source_time_zone" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"coverage" text DEFAULT 'unknown' NOT NULL,
	"error_code" text,
	"started_at" text NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
CREATE TABLE "monitoring_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"backfill_days" integer DEFAULT 480 NOT NULL,
	"next_run_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_source_states" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source" text NOT NULL,
	"source_property" text NOT NULL,
	"refreshed_through" text,
	"backfill_before" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_budget_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" text NOT NULL,
	"month" text NOT NULL,
	"limit_micros" integer NOT NULL,
	"committed_micros" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_budget_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"data_limit_micros" integer DEFAULT 15000000 NOT NULL,
	"ai_limit_micros" integer DEFAULT 5000000 NOT NULL,
	"usd_to_eur" double precision DEFAULT 1 NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"estimated_usd" double precision NOT NULL,
	"actual_usd" double precision,
	"reserved_micros" integer NOT NULL,
	"usd_to_eur" double precision NOT NULL,
	"created_at" text NOT NULL,
	"settled_at" text
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source" text NOT NULL,
	"file_name" text NOT NULL,
	"fingerprint" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"row_count" integer NOT NULL,
	"status" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "imported_backlinks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"row_key" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor" text,
	"rel" text,
	"first_seen" text,
	"last_seen" text,
	"imported_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_geo_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"source" text NOT NULL,
	"row_key" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"page_url" text,
	"query" text,
	"country" text,
	"device" text,
	"metric" text NOT NULL,
	"value" integer NOT NULL,
	"imported_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlink_prospects" ADD CONSTRAINT "backlink_prospects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbench_actions" ADD CONSTRAINT "workbench_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbench_events" ADD CONSTRAINT "workbench_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbench_events" ADD CONSTRAINT "workbench_events_action_id_workbench_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."workbench_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbench_events" ADD CONSTRAINT "workbench_events_prospect_id_backlink_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."backlink_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_daily_metrics" ADD CONSTRAINT "monitoring_daily_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_settings" ADD CONSTRAINT "monitoring_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_settings" ADD CONSTRAINT "monitoring_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_source_states" ADD CONSTRAINT "monitoring_source_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_budget_periods" ADD CONSTRAINT "usage_budget_periods_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_budget_settings" ADD CONSTRAINT "usage_budget_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_period_id_usage_budget_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."usage_budget_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_backlinks" ADD CONSTRAINT "imported_backlinks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_backlinks" ADD CONSTRAINT "imported_backlinks_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_geo_metrics" ADD CONSTRAINT "imported_geo_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_geo_metrics" ADD CONSTRAINT "imported_geo_metrics_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backlink_prospects_urls_idx" ON "backlink_prospects" USING btree ("project_id","source_url","target_url");--> statement-breakpoint
CREATE INDEX "backlink_prospects_status_idx" ON "backlink_prospects" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workbench_actions_source_idx" ON "workbench_actions" USING btree ("project_id","source_key");--> statement-breakpoint
CREATE INDEX "workbench_actions_status_idx" ON "workbench_actions" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "workbench_events_action_idx" ON "workbench_events" USING btree ("project_id","action_id","created_at");--> statement-breakpoint
CREATE INDEX "workbench_events_prospect_idx" ON "workbench_events" USING btree ("project_id","prospect_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_daily_key_idx" ON "monitoring_daily_metrics" USING btree ("project_id","source","source_property","grain","date","page");--> statement-breakpoint
CREATE INDEX "monitoring_runs_project_source_idx" ON "monitoring_runs" USING btree ("project_id","source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_source_state_key_idx" ON "monitoring_source_states" USING btree ("project_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_budget_period_key_idx" ON "usage_budget_periods" USING btree ("organization_id","category","month");--> statement-breakpoint
CREATE INDEX "usage_reservations_org_created_idx" ON "usage_reservations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_project_fingerprint_idx" ON "import_batches" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "import_batches_project_created_idx" ON "import_batches" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_backlinks_project_row_idx" ON "imported_backlinks" USING btree ("project_id","row_key");--> statement-breakpoint
CREATE INDEX "imported_backlinks_project_batch_idx" ON "imported_backlinks" USING btree ("project_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_geo_project_source_row_idx" ON "imported_geo_metrics" USING btree ("project_id","source","row_key");--> statement-breakpoint
CREATE INDEX "imported_geo_project_batch_idx" ON "imported_geo_metrics" USING btree ("project_id","batch_id");