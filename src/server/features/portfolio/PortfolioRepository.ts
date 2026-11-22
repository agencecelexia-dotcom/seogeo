import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiRuns,
  aiTrackers,
  auditPages,
  audits,
  backlinkProspects,
  ga4Connections,
  gscConnections,
  importedBacklinks,
  importedGeoMetrics,
  monitoringDailyMetrics,
  monitoringRuns,
  projects,
  workbenchActions,
} from "@/db/schema";

async function listProjects(organizationId: string) {
  return db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    );
}

async function projectSummary(projectId: string) {
  const [gsc, ga4, audit, tracker, geoRun, actions, prospects, runs] =
    await Promise.all([
      db
        .select({ siteUrl: gscConnections.siteUrl })
        .from(gscConnections)
        .where(eq(gscConnections.projectId, projectId))
        .limit(1),
      db
        .select({ property: ga4Connections.propertyDisplayName })
        .from(ga4Connections)
        .where(eq(ga4Connections.projectId, projectId))
        .limit(1),
      db
        .select()
        .from(audits)
        .where(eq(audits.projectId, projectId))
        .orderBy(desc(audits.startedAt))
        .limit(1),
      db
        .select()
        .from(aiTrackers)
        .where(eq(aiTrackers.projectId, projectId))
        .limit(1),
      db
        .select()
        .from(aiRuns)
        .where(eq(aiRuns.projectId, projectId))
        .orderBy(desc(aiRuns.createdAt))
        .limit(1),
      db
        .select()
        .from(workbenchActions)
        .where(
          and(
            eq(workbenchActions.projectId, projectId),
            inArray(workbenchActions.status, ["todo", "planned", "done"]),
          ),
        )
        .orderBy(desc(workbenchActions.updatedAt)),
      db
        .select({
          status: backlinkProspects.status,
          count: sql<number>`count(*)`,
        })
        .from(backlinkProspects)
        .where(eq(backlinkProspects.projectId, projectId))
        .groupBy(backlinkProspects.status),
      db
        .select()
        .from(monitoringRuns)
        .where(eq(monitoringRuns.projectId, projectId))
        .orderBy(desc(monitoringRuns.startedAt))
        .limit(10),
    ]);
  return {
    gsc: gsc[0] ?? null,
    ga4: ga4[0] ?? null,
    audit: audit[0] ?? null,
    tracker: tracker[0] ?? null,
    geoRun: geoRun[0] ?? null,
    actions,
    prospects,
    runs,
  };
}

async function pageEvidence(projectId: string, since: string) {
  const [gsc, ga4] = await Promise.all([
    db
      .select({ property: gscConnections.siteUrl })
      .from(gscConnections)
      .where(eq(gscConnections.projectId, projectId))
      .limit(1),
    db
      .select({ property: ga4Connections.propertyId })
      .from(ga4Connections)
      .where(eq(ga4Connections.projectId, projectId))
      .limit(1),
  ]);
  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.startedAt))
    .limit(1);
  const [pages, metrics, geo, links, actions] = await Promise.all([
    audit
      ? db
          .select()
          .from(auditPages)
          .where(eq(auditPages.auditId, audit.id))
          .orderBy(auditPages.url)
          .limit(1000)
      : Promise.resolve([]),
    db
      .select()
      .from(monitoringDailyMetrics)
      .where(
        and(
          eq(monitoringDailyMetrics.projectId, projectId),
          gte(monitoringDailyMetrics.date, since),
          or(
            and(
              eq(monitoringDailyMetrics.source, "gsc"),
              eq(monitoringDailyMetrics.sourceProperty, gsc[0]?.property ?? ""),
            ),
            and(
              eq(monitoringDailyMetrics.source, "ga4"),
              eq(monitoringDailyMetrics.sourceProperty, ga4[0]?.property ?? ""),
            ),
          ),
        ),
      )
      .orderBy(desc(monitoringDailyMetrics.date))
      .limit(30000),
    db
      .select()
      .from(importedGeoMetrics)
      .where(eq(importedGeoMetrics.projectId, projectId))
      .orderBy(desc(importedGeoMetrics.importedAt))
      .limit(2000),
    db
      .select()
      .from(importedBacklinks)
      .where(eq(importedBacklinks.projectId, projectId))
      .limit(2000),
    db
      .select()
      .from(workbenchActions)
      .where(eq(workbenchActions.projectId, projectId))
      .limit(1000),
  ]);
  return { audit: audit ?? null, pages, metrics, geo, links, actions };
}

export const PortfolioRepository = {
  listProjects,
  projectSummary,
  pageEvidence,
};
