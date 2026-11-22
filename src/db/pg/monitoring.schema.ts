import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

export const monitoringSettings = pgTable("monitoring_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  backfillDays: integer("backfill_days").notNull().default(480),
  nextRunAt: text("next_run_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const monitoringRuns = pgTable(
  "monitoring_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    sourceProperty: text("source_property"),
    sourceTimeZone: text("source_time_zone").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    coverage: text("coverage").notNull().default("unknown"),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("monitoring_runs_project_source_idx").on(
      table.projectId,
      table.source,
      table.startedAt,
    ),
  ],
);

// Separate grains: never add property totals to page totals or compare clicks to sessions.
export const monitoringDailyMetrics = pgTable(
  "monitoring_daily_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceProperty: text("source_property").notNull(),
    sourceTimeZone: text("source_time_zone").notNull(),
    grain: text("grain").notNull(),
    date: text("date").notNull(),
    page: text("page").notNull().default(""),
    clicks: doublePrecision("clicks"),
    impressions: doublePrecision("impressions"),
    position: doublePrecision("position"),
    sessions: doublePrecision("sessions"),
    keyEvents: doublePrecision("key_events"),
    revenue: doublePrecision("revenue"),
    currencyCode: text("currency_code"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("monitoring_daily_key_idx").on(
      table.projectId,
      table.source,
      table.sourceProperty,
      table.grain,
      table.date,
      table.page,
    ),
  ],
);

export const usageBudgetSettings = pgTable("usage_budget_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  dataLimitMicros: integer("data_limit_micros").notNull().default(15000000),
  aiLimitMicros: integer("ai_limit_micros").notNull().default(5000000),
  // Explicit planning conversion, not a live foreign-exchange quote.
  usdToEur: doublePrecision("usd_to_eur").notNull().default(1),
  suspended: boolean("suspended").notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});
export const usageBudgetPeriods = pgTable(
  "usage_budget_periods",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    month: text("month").notNull(),
    limitMicros: integer("limit_micros").notNull(),
    // Includes unsettled reservations; uncertain transport outcomes keep their ceiling.
    committedMicros: integer("committed_micros").notNull().default(0),
  },
  (table) => [
    uniqueIndex("usage_budget_period_key_idx").on(
      table.organizationId,
      table.category,
      table.month,
    ),
  ],
);
export const usageReservations = pgTable(
  "usage_reservations",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => usageBudgetPeriods.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    estimatedUsd: doublePrecision("estimated_usd").notNull(),
    actualUsd: doublePrecision("actual_usd"),
    reservedMicros: integer("reserved_micros").notNull(),
    usdToEur: doublePrecision("usd_to_eur").notNull(),
    createdAt: text("created_at").notNull(),
    settledAt: text("settled_at"),
  },
  (table) => [
    index("usage_reservations_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const monitoringSourceStates = pgTable(
  "monitoring_source_states",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceProperty: text("source_property").notNull(),
    refreshedThrough: text("refreshed_through"),
    refreshCycleDate: text("refresh_cycle_date"),
    backfillBefore: text("backfill_before"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("monitoring_source_state_key_idx").on(
      table.projectId,
      table.source,
    ),
  ],
);
