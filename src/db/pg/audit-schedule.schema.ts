import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { user } from "./better-auth-schema";

export const auditSchedules = pgTable("audit_schedules", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorizedByUserId: text("authorized_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  maxPages: integer("max_pages").notNull().default(1000),
  nextRunAt: text("next_run_at").notNull(),
  lastRunAt: text("last_run_at"),
  lastOutcome: text("last_outcome"),
  updatedAt: text("updated_at").notNull(),
});
