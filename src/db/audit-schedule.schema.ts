import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { user } from "./better-auth-schema";

export const auditSchedules = sqliteTable("audit_schedules", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorizedByUserId: text("authorized_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  maxPages: integer("max_pages").notNull().default(1000),
  nextRunAt: text("next_run_at").notNull(),
  lastRunAt: text("last_run_at"),
  lastOutcome: text("last_outcome"),
  updatedAt: text("updated_at").notNull(),
});
