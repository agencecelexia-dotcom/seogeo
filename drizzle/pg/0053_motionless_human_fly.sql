CREATE TABLE "workbench_discovery_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"authorized_by_user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"target_url" text NOT NULL,
	"next_run_at" text NOT NULL,
	"last_run_at" text,
	"last_outcome" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_schedules" (
	"project_id" text PRIMARY KEY NOT NULL,
	"authorized_by_user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_pages" integer DEFAULT 1000 NOT NULL,
	"next_run_at" text NOT NULL,
	"last_run_at" text,
	"last_outcome" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitoring_source_states" ADD COLUMN "refresh_cycle_date" text;--> statement-breakpoint
ALTER TABLE "workbench_discovery_settings" ADD CONSTRAINT "workbench_discovery_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbench_discovery_settings" ADD CONSTRAINT "workbench_discovery_settings_authorized_by_user_id_user_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_authorized_by_user_id_user_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workbench_discovery_due_idx" ON "workbench_discovery_settings" USING btree ("enabled","next_run_at");