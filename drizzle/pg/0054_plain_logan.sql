CREATE TABLE "runtime_blob_deletions" (
	"blob_url" text PRIMARY KEY NOT NULL,
	"queued_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_blob_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"blob_url" text NOT NULL,
	"size" integer NOT NULL,
	"etag" text NOT NULL,
	"http_metadata" text NOT NULL,
	"custom_metadata" text NOT NULL,
	"uploaded_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_kv_entries" (
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"metadata" text,
	"expires_at" text,
	"updated_at" text NOT NULL,
	CONSTRAINT "runtime_kv_entries_namespace_key_pk" PRIMARY KEY("namespace","key")
);
--> statement-breakpoint
CREATE TABLE "vercel_audit_edges" (
	"audit_id" text NOT NULL,
	"source_page_id" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	CONSTRAINT "vercel_audit_edges_audit_id_source_page_id_target_url_pk" PRIMARY KEY("audit_id","source_page_id","target_url")
);
--> statement-breakpoint
CREATE TABLE "vercel_audit_frontier" (
	"audit_id" text NOT NULL,
	"url" text NOT NULL,
	"depth" integer,
	"source" text NOT NULL,
	"in_sitemap" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"chunk_no" integer,
	"queue_order" integer NOT NULL,
	CONSTRAINT "vercel_audit_frontier_audit_id_url_pk" PRIMARY KEY("audit_id","url")
);
--> statement-breakpoint
CREATE TABLE "vercel_audit_pages" (
	"audit_id" text NOT NULL,
	"page_id" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer NOT NULL,
	"fetch_class" text NOT NULL,
	"redirect_url" text,
	CONSTRAINT "vercel_audit_pages_audit_id_page_id_pk" PRIMARY KEY("audit_id","page_id")
);
--> statement-breakpoint
CREATE TABLE "vercel_audit_scratchpads" (
	"audit_id" text PRIMARY KEY NOT NULL,
	"throttle_text" text,
	"graph_complete" integer DEFAULT 1 NOT NULL,
	"edge_count" integer DEFAULT 0 NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vercel_workflow_jobs" (
	"job_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"instance_id" text NOT NULL,
	"project_id" text,
	"payload_text" text NOT NULL,
	"state" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"output_text" text,
	"error_text" text,
	"created_at" text NOT NULL,
	"next_run_at" text NOT NULL,
	"lease_until" text,
	"lease_token" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vercel_workflow_steps" (
	"job_key" text NOT NULL,
	"generation" integer NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" text,
	"result_text" text,
	"error_text" text,
	"updated_at" text NOT NULL,
	CONSTRAINT "vercel_workflow_steps_job_key_generation_name_pk" PRIMARY KEY("job_key","generation","name")
);
--> statement-breakpoint
ALTER TABLE "vercel_audit_edges" ADD CONSTRAINT "vercel_audit_edges_audit_id_vercel_audit_scratchpads_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."vercel_audit_scratchpads"("audit_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vercel_audit_frontier" ADD CONSTRAINT "vercel_audit_frontier_audit_id_vercel_audit_scratchpads_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."vercel_audit_scratchpads"("audit_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vercel_audit_pages" ADD CONSTRAINT "vercel_audit_pages_audit_id_vercel_audit_scratchpads_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."vercel_audit_scratchpads"("audit_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vercel_workflow_jobs" ADD CONSTRAINT "vercel_workflow_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vercel_workflow_steps" ADD CONSTRAINT "vercel_workflow_steps_job_key_vercel_workflow_jobs_job_key_fk" FOREIGN KEY ("job_key") REFERENCES "public"."vercel_workflow_jobs"("job_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtime_kv_expiry_idx" ON "runtime_kv_entries" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vercel_audit_edge_target_idx" ON "vercel_audit_edges" USING btree ("audit_id","target_url");--> statement-breakpoint
CREATE INDEX "vercel_frontier_claim_idx" ON "vercel_audit_frontier" USING btree ("audit_id","state","source","queue_order");--> statement-breakpoint
CREATE INDEX "vercel_audit_page_url_idx" ON "vercel_audit_pages" USING btree ("audit_id","url");--> statement-breakpoint
CREATE INDEX "vercel_audit_page_redirect_idx" ON "vercel_audit_pages" USING btree ("audit_id","redirect_url");--> statement-breakpoint
CREATE INDEX "vercel_scratchpad_expiry_idx" ON "vercel_audit_scratchpads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vercel_workflow_due_idx" ON "vercel_workflow_jobs" USING btree ("state","next_run_at");