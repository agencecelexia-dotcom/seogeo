CREATE TABLE "external_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"platform_name" text NOT NULL,
	"target_keyword" text NOT NULL,
	"target_url" text NOT NULL,
	"support_url" text,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"published_url" text,
	"published_at" text,
	"link_policy" text DEFAULT 'unknown' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_publications" ADD CONSTRAINT "external_publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_publications_project_updated_idx" ON "external_publications" USING btree ("project_id","updated_at","id");