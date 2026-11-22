import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { audits } from "./audit.schema";

// Runtime checkpoint payloads are infrastructure state; site data stays normalized.
export const vercelWorkflowJobs = sqliteTable(
  "vercel_workflow_jobs",
  {
    jobKey: text("job_key").primaryKey(),
    kind: text("kind").notNull(),
    instanceId: text("instance_id").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    payloadText: text("payload_text").notNull(),
    state: text("state").notNull(),
    generation: integer("generation").notNull().default(0),
    outputText: text("output_text"),
    errorText: text("error_text"),
    createdAt: text("created_at").notNull(),
    nextRunAt: text("next_run_at").notNull(),
    leaseUntil: text("lease_until"),
    leaseToken: text("lease_token"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("vercel_workflow_due_idx").on(table.state, table.nextRunAt),
  ],
);
export const vercelWorkflowSteps = sqliteTable(
  "vercel_workflow_steps",
  {
    jobKey: text("job_key")
      .notNull()
      .references(() => vercelWorkflowJobs.jobKey, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: text("next_run_at"),
    resultText: text("result_text"),
    errorText: text("error_text"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.jobKey, table.generation, table.name] }),
  ],
);
export const vercelAuditScratchpads = sqliteTable(
  "vercel_audit_scratchpads",
  {
    auditId: text("audit_id")
      .primaryKey()
      .references(() => audits.id, { onDelete: "cascade" }),
    throttleText: text("throttle_text"),
    graphComplete: integer("graph_complete").notNull().default(1),
    edgeCount: integer("edge_count").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("vercel_scratchpad_expiry_idx").on(table.expiresAt)],
);
export const vercelAuditFrontier = sqliteTable(
  "vercel_audit_frontier",
  {
    auditId: text("audit_id")
      .notNull()
      .references(() => vercelAuditScratchpads.auditId, {
        onDelete: "cascade",
      }),
    url: text("url").notNull(),
    depth: integer("depth"),
    source: text("source").notNull(),
    inSitemap: integer("in_sitemap").notNull().default(0),
    state: text("state").notNull().default("pending"),
    chunkNo: integer("chunk_no"),
    queueOrder: integer("queue_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.auditId, table.url] }),
    index("vercel_frontier_claim_idx").on(
      table.auditId,
      table.state,
      table.source,
      table.queueOrder,
    ),
  ],
);
export const vercelAuditPages = sqliteTable(
  "vercel_audit_pages",
  {
    auditId: text("audit_id")
      .notNull()
      .references(() => vercelAuditScratchpads.auditId, {
        onDelete: "cascade",
      }),
    pageId: text("page_id").notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code").notNull(),
    fetchClass: text("fetch_class").notNull(),
    redirectUrl: text("redirect_url"),
  },
  (table) => [
    primaryKey({ columns: [table.auditId, table.pageId] }),
    index("vercel_audit_page_url_idx").on(table.auditId, table.url),
    index("vercel_audit_page_redirect_idx").on(
      table.auditId,
      table.redirectUrl,
    ),
  ],
);
export const vercelAuditEdges = sqliteTable(
  "vercel_audit_edges",
  {
    auditId: text("audit_id")
      .notNull()
      .references(() => vercelAuditScratchpads.auditId, {
        onDelete: "cascade",
      }),
    sourcePageId: text("source_page_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.auditId, table.sourcePageId, table.targetUrl],
    }),
    index("vercel_audit_edge_target_idx").on(table.auditId, table.targetUrl),
  ],
);
