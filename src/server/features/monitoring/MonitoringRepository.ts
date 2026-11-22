import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  monitoringSettings,
  monitoringRuns,
  monitoringDailyMetrics,
  monitoringSourceStates,
  projects,
  gscConnections,
  ga4Connections,
} from "@/db/schema";

export type DailyMetric = typeof monitoringDailyMetrics.$inferInsert;

async function getSettings(projectId: string, organizationId: string) {
  await db
    .insert(monitoringSettings)
    .values({
      projectId,
      organizationId,
      nextRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(monitoringSettings)
    .where(
      and(
        eq(monitoringSettings.projectId, projectId),
        eq(monitoringSettings.organizationId, organizationId),
      ),
    );
  if (!row) throw new Error("Monitoring settings unavailable");
  return row;
}
async function updateSettings(
  projectId: string,
  organizationId: string,
  input: { enabled: boolean; backfillDays: number },
) {
  await getSettings(projectId, organizationId);
  await db
    .update(monitoringSettings)
    .set({
      ...input,
      nextRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(monitoringSettings.projectId, projectId),
        eq(monitoringSettings.organizationId, organizationId),
      ),
    );
}
async function nextRun(projectId: string, nextRunAt: string) {
  await db
    .update(monitoringSettings)
    .set({ nextRunAt })
    .where(eq(monitoringSettings.projectId, projectId));
}
async function listDue(now: string) {
  return db
    .select({ projectId: projects.id, organizationId: projects.organizationId })
    .from(projects)
    .leftJoin(monitoringSettings, eq(projects.id, monitoringSettings.projectId))
    .where(
      and(
        isNull(projects.archivedAt),
        isNotNull(projects.domain),
        lte(monitoringSettings.nextRunAt, now),
        eq(monitoringSettings.enabled, true),
      ),
    )
    .orderBy(asc(monitoringSettings.nextRunAt), asc(projects.id))
    .limit(5);
}
async function initializeProjects() {
  const rows = await db
    .select({ projectId: projects.id, organizationId: projects.organizationId })
    .from(projects)
    .leftJoin(monitoringSettings, eq(projects.id, monitoringSettings.projectId))
    .where(
      and(
        isNull(projects.archivedAt),
        isNotNull(projects.domain),
        isNull(monitoringSettings.projectId),
      ),
    )
    .limit(20);
  for (const row of rows) await getSettings(row.projectId, row.organizationId);
}
async function sourceState(
  projectId: string,
  source: string,
): Promise<typeof monitoringSourceStates.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(monitoringSourceStates)
    .where(
      and(
        eq(monitoringSourceStates.projectId, projectId),
        eq(monitoringSourceStates.source, source),
      ),
    );
  return row ?? null;
}
function connectionScope(
  projectId: string,
  source: string,
  sourceProperty: string,
  connectionId: string,
) {
  const table = source === "gsc" ? gscConnections : ga4Connections;
  const property =
    source === "gsc" ? gscConnections.siteUrl : ga4Connections.propertyId;
  return {
    table,
    condition: and(
      eq(table.projectId, projectId),
      eq(table.id, connectionId),
      eq(property, sourceProperty),
    ),
  };
}
async function saveSourceState(
  input: typeof monitoringSourceStates.$inferInsert,
  connectionId: string,
) {
  const { table, condition } = connectionScope(
    input.projectId,
    input.source,
    input.sourceProperty,
    connectionId,
  );
  await runBatch((tx) => [
    // Serializes against a concurrent disconnect in Postgres; SQLite's write
    // transaction already serializes both batches. The next statement sees
    // whether the captured connection still exists after waiting for the lock.
    tx
      .update(table)
      .set({ id: sql`${table.id}` })
      .where(condition),
    tx
      .insert(monitoringSourceStates)
      .select(
        tx
          .select({
            id: sql`${input.id}`.as("id"),
            projectId: sql`${input.projectId}`.as("project_id"),
            source: sql`${input.source}`.as("source"),
            sourceProperty: sql`${input.sourceProperty}`.as("source_property"),
            refreshedThrough: sql`${input.refreshedThrough ?? null}`.as(
              "refreshed_through",
            ),
            refreshCycleDate: sql`${input.refreshCycleDate ?? null}`.as(
              "refresh_cycle_date",
            ),
            backfillBefore: sql`${input.backfillBefore ?? null}`.as(
              "backfill_before",
            ),
            updatedAt: sql`${input.updatedAt}`.as("updated_at"),
          })
          .from(table)
          .where(condition),
      )
      .onConflictDoUpdate({ target: monitoringSourceStates.id, set: input }),
  ]);
}
async function startRun(input: typeof monitoringRuns.$inferInsert) {
  await db.insert(monitoringRuns).values(input);
}
async function finishRun(
  id: string,
  input: Partial<typeof monitoringRuns.$inferInsert>,
) {
  await db.update(monitoringRuns).set(input).where(eq(monitoringRuns.id, id));
}
// A complete day is replaced atomically, including an empty result. Never
// retain rows Google no longer returns on a corrected/replayed day.
async function replaceDay(
  projectId: string,
  source: string,
  sourceProperty: string,
  date: string,
  { rows, connectionId }: { rows: DailyMetric[]; connectionId: string },
) {
  const { table, condition } = connectionScope(
    projectId,
    source,
    sourceProperty,
    connectionId,
  );
  await runBatch((tx) => [
    tx
      .update(table)
      .set({ id: sql`${table.id}` })
      .where(condition),
    tx
      .delete(monitoringDailyMetrics)
      .where(
        and(
          eq(monitoringDailyMetrics.projectId, projectId),
          eq(monitoringDailyMetrics.source, source),
          eq(monitoringDailyMetrics.sourceProperty, sourceProperty),
          eq(monitoringDailyMetrics.date, date),
          exists(tx.select({ id: table.id }).from(table).where(condition)),
        ),
      ),
    ...rows.map((row) =>
      tx.insert(monitoringDailyMetrics).select(
        tx
          .select({
            id: sql`${row.id}`.as("id"),
            projectId: sql`${projectId}`.as("project_id"),
            source: sql`${source}`.as("source"),
            sourceProperty: sql`${sourceProperty}`.as("source_property"),
            sourceTimeZone: sql`${row.sourceTimeZone}`.as("source_time_zone"),
            grain: sql`${row.grain}`.as("grain"),
            date: sql`${date}`.as("date"),
            page: sql`${row.page ?? ""}`.as("page"),
            clicks: sql`${row.clicks ?? null}`.as("clicks"),
            impressions: sql`${row.impressions ?? null}`.as("impressions"),
            position: sql`${row.position ?? null}`.as("position"),
            sessions: sql`${row.sessions ?? null}`.as("sessions"),
            keyEvents: sql`${row.keyEvents ?? null}`.as("key_events"),
            revenue: sql`${row.revenue ?? null}`.as("revenue"),
            currencyCode: sql`${row.currencyCode ?? null}`.as("currency_code"),
            fetchedAt: sql`${row.fetchedAt}`.as("fetched_at"),
          })
          .from(table)
          .where(condition),
      ),
    ),
  ]);
}
async function purgeSource(
  projectId: string,
  source: string,
  disconnect = false,
) {
  const table = source === "gsc" ? gscConnections : ga4Connections;
  await runBatch((tx) => [
    // Delete the connection before the data in the same transaction. A writer
    // already holding its row lock finishes before this purge; later writers
    // cannot observe a live connection and therefore insert nothing.
    ...(disconnect
      ? [tx.delete(table).where(eq(table.projectId, projectId))]
      : []),
    tx
      .delete(monitoringDailyMetrics)
      .where(
        and(
          eq(monitoringDailyMetrics.projectId, projectId),
          eq(monitoringDailyMetrics.source, source),
        ),
      ),
    tx
      .delete(monitoringSourceStates)
      .where(
        and(
          eq(monitoringSourceStates.projectId, projectId),
          eq(monitoringSourceStates.source, source),
        ),
      ),
    tx
      .delete(monitoringRuns)
      .where(
        and(
          eq(monitoringRuns.projectId, projectId),
          eq(monitoringRuns.source, source),
        ),
      ),
  ]);
}
async function overview(organizationId: string) {
  const [settings, runs, states] = await Promise.all([
    db
      .select()
      .from(monitoringSettings)
      .where(eq(monitoringSettings.organizationId, organizationId)),
    db
      .select()
      .from(monitoringRuns)
      .where(eq(monitoringRuns.organizationId, organizationId))
      .orderBy(desc(monitoringRuns.startedAt))
      .limit(100),
    db
      .select({ state: monitoringSourceStates })
      .from(monitoringSourceStates)
      .innerJoin(projects, eq(projects.id, monitoringSourceStates.projectId))
      .where(eq(projects.organizationId, organizationId)),
  ]);
  return { settings, runs, states: states.map((row) => row.state) };
}
async function metrics(
  organizationId: string,
  startDate: string,
  endDate: string,
) {
  return db
    .select({ metric: monitoringDailyMetrics })
    .from(monitoringDailyMetrics)
    .innerJoin(projects, eq(projects.id, monitoringDailyMetrics.projectId))
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
        gte(monitoringDailyMetrics.date, startDate),
        lte(monitoringDailyMetrics.date, endDate),
      ),
    );
}
export const MonitoringRepository = {
  getSettings,
  updateSettings,
  nextRun,
  listDue,
  initializeProjects,
  sourceState,
  saveSourceState,
  startRun,
  finishRun,
  replaceDay,
  purgeSource,
  overview,
  metrics,
};
