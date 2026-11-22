import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  audits,
  backlinkProspects,
  importBatches,
  monitoringRuns,
  monitoringSourceStates,
  projects,
  workbenchActions,
  workbenchEvents,
} from "@/db/schema";

async function evidence(organizationId: string, from: string, through: string) {
  const scope = and(
    eq(projects.organizationId, organizationId),
    isNull(projects.archivedAt),
  );
  const [completedAudits, events, imports, runs, coverage, priorities] =
    await Promise.all([
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          id: audits.id,
          startUrl: audits.startUrl,
          completedAt: audits.completedAt,
          pagesCrawled: audits.pagesCrawled,
          pagesTotal: audits.pagesTotal,
        })
        .from(audits)
        .innerJoin(projects, eq(projects.id, audits.projectId))
        .where(
          and(
            scope,
            eq(audits.status, "completed"),
            gte(audits.completedAt, from),
            lte(audits.completedAt, through),
          ),
        )
        .orderBy(desc(audits.completedAt))
        .limit(501),
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          id: workbenchEvents.id,
          createdAt: workbenchEvents.createdAt,
          fromStatus: workbenchEvents.fromStatus,
          toStatus: workbenchEvents.toStatus,
          note: workbenchEvents.note,
          actionTitle: workbenchActions.title,
          actionUrl: workbenchActions.pageUrl,
          prospectUrl: backlinkProspects.sourceUrl,
        })
        .from(workbenchEvents)
        .innerJoin(projects, eq(projects.id, workbenchEvents.projectId))
        .leftJoin(
          workbenchActions,
          and(
            eq(workbenchActions.id, workbenchEvents.actionId),
            eq(workbenchActions.projectId, projects.id),
          ),
        )
        .leftJoin(
          backlinkProspects,
          and(
            eq(backlinkProspects.id, workbenchEvents.prospectId),
            eq(backlinkProspects.projectId, projects.id),
          ),
        )
        .where(
          and(
            scope,
            gte(workbenchEvents.createdAt, from),
            lte(workbenchEvents.createdAt, through),
          ),
        )
        .orderBy(desc(workbenchEvents.createdAt))
        .limit(501),
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          id: importBatches.id,
          source: importBatches.source,
          status: importBatches.status,
          rowCount: importBatches.rowCount,
          periodStart: importBatches.periodStart,
          periodEnd: importBatches.periodEnd,
          createdAt: importBatches.createdAt,
        })
        .from(importBatches)
        .innerJoin(projects, eq(projects.id, importBatches.projectId))
        .where(
          and(
            scope,
            gte(importBatches.createdAt, from),
            lte(importBatches.createdAt, through),
          ),
        )
        .orderBy(desc(importBatches.createdAt))
        .limit(501),
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          run: monitoringRuns,
        })
        .from(monitoringRuns)
        .innerJoin(projects, eq(projects.id, monitoringRuns.projectId))
        .where(
          and(
            scope,
            gte(monitoringRuns.startedAt, from),
            lte(monitoringRuns.startedAt, through),
          ),
        )
        .orderBy(desc(monitoringRuns.startedAt))
        .limit(501),
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          state: monitoringSourceStates,
        })
        .from(monitoringSourceStates)
        .innerJoin(projects, eq(projects.id, monitoringSourceStates.projectId))
        .where(scope)
        .orderBy(desc(monitoringSourceStates.updatedAt))
        .limit(501),
      db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          id: workbenchActions.id,
          title: workbenchActions.title,
          pageUrl: workbenchActions.pageUrl,
          recommendation: workbenchActions.recommendation,
          evidenceText: workbenchActions.evidenceText,
          updatedAt: workbenchActions.updatedAt,
        })
        .from(workbenchActions)
        .innerJoin(projects, eq(projects.id, workbenchActions.projectId))
        .where(
          and(
            scope,
            eq(workbenchActions.priority, "high"),
            inArray(workbenchActions.status, ["todo", "planned"]),
          ),
        )
        .orderBy(desc(workbenchActions.updatedAt))
        .limit(21),
    ]);
  return { completedAudits, events, imports, runs, coverage, priorities };
}
export const WeeklyReviewRepository = { evidence };
