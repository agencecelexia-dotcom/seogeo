import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import {
  EXTERNAL_PUBLICATION_LINK_POLICIES,
  EXTERNAL_PUBLICATION_STATUSES,
  EXTERNAL_PUBLICATION_STRATEGIES,
} from "@/types/schemas/external-publications";

export const externalPublications = sqliteTable(
  "external_publications",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    strategyId: text("strategy_id", {
      enum: EXTERNAL_PUBLICATION_STRATEGIES,
    }).notNull(),
    platformName: text("platform_name").notNull(),
    targetKeyword: text("target_keyword").notNull(),
    targetUrl: text("target_url").notNull(),
    supportUrl: text("support_url"),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    status: text("status", { enum: EXTERNAL_PUBLICATION_STATUSES })
      .notNull()
      .default("idea"),
    publishedUrl: text("published_url"),
    publishedAt: text("published_at"),
    linkPolicy: text("link_policy", {
      enum: EXTERNAL_PUBLICATION_LINK_POLICIES,
    })
      .notNull()
      .default("unknown"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("external_publications_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
      table.id,
    ),
  ],
);
