import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source", {
      enum: ["gsc_generative", "bing_ai", "backlinks"],
    }).notNull(),
    fileName: text("file_name").notNull(),
    fingerprint: text("fingerprint").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    rowCount: integer("row_count").notNull(),
    status: text("status", {
      enum: ["pending", "complete", "failed"],
    }).notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("import_batches_project_fingerprint_idx").on(
      table.projectId,
      table.fingerprint,
    ),
    index("import_batches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// A row is an observation at the export's granularity, not an additive event.
// Query/page/country/device reports must never be summed across granularities.
export const importedGeoMetrics = sqliteTable(
  "imported_geo_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["gsc_generative", "bing_ai"] }).notNull(),
    rowKey: text("row_key").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    pageUrl: text("page_url"),
    query: text("query"),
    country: text("country"),
    device: text("device"),
    metric: text("metric", { enum: ["impressions", "citations"] }).notNull(),
    value: integer("value").notNull(),
    importedAt: text("imported_at").notNull(),
  },
  (table) => [
    uniqueIndex("imported_geo_project_source_row_idx").on(
      table.projectId,
      table.source,
      table.rowKey,
    ),
    index("imported_geo_project_batch_idx").on(table.projectId, table.batchId),
  ],
);

export const importedBacklinks = sqliteTable(
  "imported_backlinks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowKey: text("row_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    anchor: text("anchor"),
    rel: text("rel"),
    firstSeen: text("first_seen"),
    lastSeen: text("last_seen"),
    importedAt: text("imported_at").notNull(),
  },
  (table) => [
    uniqueIndex("imported_backlinks_project_row_idx").on(
      table.projectId,
      table.rowKey,
    ),
    index("imported_backlinks_project_batch_idx").on(
      table.projectId,
      table.batchId,
    ),
  ],
);
