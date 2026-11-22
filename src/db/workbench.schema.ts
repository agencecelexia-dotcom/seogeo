import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./better-auth-schema";
import { projects } from "./app.schema";
import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  LINK_CHECK_STATUSES,
  PROSPECT_STATUSES,
} from "@/types/schemas/workbench";

export const workbenchActions = sqliteTable(
  "workbench_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pageUrl: text("page_url").notNull(),
    evidenceUrl: text("evidence_url"),
    evidenceText: text("evidence_text").notNull(),
    recommendation: text("recommendation").notNull(),
    source: text("source", { enum: ["manual", "audit"] }).notNull(),
    sourceKey: text("source_key").notNull(),
    ruleId: text("rule_id"),
    priority: text("priority", { enum: ACTION_PRIORITIES })
      .notNull()
      .default("medium"),
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("todo"),
    revision: integer("revision").notNull().default(0),
    completedAt: text("completed_at"),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workbench_actions_source_idx").on(
      table.projectId,
      table.sourceKey,
    ),
    index("workbench_actions_status_idx").on(table.projectId, table.status),
  ],
);

export const backlinkProspects = sqliteTable(
  "backlink_prospects",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    reason: text("reason").notNull(),
    contactName: text("contact_name").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    contactSourceUrl: text("contact_source_url"),
    draft: text("draft").notNull().default(""),
    status: text("status", { enum: PROSPECT_STATUSES })
      .notNull()
      .default("discovered"),
    revision: integer("revision").notNull().default(0),
    checkStatus: text("check_status", { enum: LINK_CHECK_STATUSES })
      .notNull()
      .default("unchecked"),
    checkDetail: text("check_detail"),
    linkRel: text("link_rel"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("backlink_prospects_urls_idx").on(
      table.projectId,
      table.sourceUrl,
      table.targetUrl,
    ),
    index("backlink_prospects_status_idx").on(table.projectId, table.status),
  ],
);

// History has explicit foreign keys, rather than embedding a changing event list
// in each action/prospect. Every write is in the same batch as its parent change.
export const workbenchEvents = sqliteTable(
  "workbench_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actionId: text("action_id").references(() => workbenchActions.id, {
      onDelete: "cascade",
    }),
    prospectId: text("prospect_id").references(() => backlinkProspects.id, {
      onDelete: "cascade",
    }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workbench_events_action_idx").on(
      table.projectId,
      table.actionId,
      table.createdAt,
    ),
    index("workbench_events_prospect_idx").on(
      table.projectId,
      table.prospectId,
      table.createdAt,
    ),
  ],
);

// Discovery is opt-in. The author remains an org member at execution time.
export const workbenchDiscoverySettings = sqliteTable(
  "workbench_discovery_settings",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorizedByUserId: text("authorized_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    targetUrl: text("target_url").notNull(),
    nextRunAt: text("next_run_at").notNull(),
    lastRunAt: text("last_run_at"),
    lastOutcome: text("last_outcome"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workbench_discovery_due_idx").on(table.enabled, table.nextRunAt),
  ],
);
