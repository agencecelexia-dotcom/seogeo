import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

// Opaque runtime cache payloads; product relationships stay in their own tables.
export const runtimeKvEntries = sqliteTable(
  "runtime_kv_entries",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    metadata: text("metadata"),
    expiresAt: text("expires_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.key] }),
    index("runtime_kv_expiry_idx").on(table.expiresAt),
  ],
);

// Payloads live in private Vercel Blob; this index preserves R2 key/metadata semantics.
export const runtimeBlobObjects = sqliteTable("runtime_blob_objects", {
  key: text("key").primaryKey(),
  blobUrl: text("blob_url").notNull(),
  size: integer("size").notNull(),
  etag: text("etag").notNull(),
  httpMetadata: text("http_metadata").notNull(),
  customMetadata: text("custom_metadata").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  expiresAt: text("expires_at"),
});

// Deleting an index entry and queuing its physical deletion are one transaction.
export const runtimeBlobDeletions = sqliteTable("runtime_blob_deletions", {
  blobUrl: text("blob_url").primaryKey(),
  queuedAt: text("queued_at").notNull(),
});
