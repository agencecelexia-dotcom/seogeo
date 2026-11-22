import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  auditIssues,
  auditPages,
  audits,
  backlinkProspects,
  workbenchActions,
  workbenchEvents,
} from "@/db/schema";

export type WorkbenchAction = typeof workbenchActions.$inferSelect;
export type BacklinkProspect = typeof backlinkProspects.$inferSelect;
type ActionInsert = typeof workbenchActions.$inferInsert;
type ProspectInsert = typeof backlinkProspects.$inferInsert;
type EventInsert = typeof workbenchEvents.$inferInsert;

async function listActions(projectId: string) {
  return db
    .select()
    .from(workbenchActions)
    .where(eq(workbenchActions.projectId, projectId))
    .orderBy(desc(workbenchActions.updatedAt), desc(workbenchActions.id))
    .limit(501);
}
async function getAction(
  projectId: string,
  actionId: string,
): Promise<WorkbenchAction | null> {
  const [row] = await db
    .select()
    .from(workbenchActions)
    .where(
      and(
        eq(workbenchActions.projectId, projectId),
        eq(workbenchActions.id, actionId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function insertAction(action: ActionInsert, event: EventInsert) {
  await runBatch((tx) => [
    tx.insert(workbenchActions).values(action).onConflictDoNothing(),
    tx.insert(workbenchEvents).values(event).onConflictDoNothing(),
  ]);
}
async function changeAction(
  action: WorkbenchAction,
  patch: Partial<ActionInsert>,
  event: EventInsert,
) {
  const guard = and(
    eq(workbenchActions.id, action.id),
    eq(workbenchActions.projectId, action.projectId),
    eq(workbenchActions.revision, action.revision),
  );
  await runBatch((tx) => [
    tx.insert(workbenchEvents).select(
      tx
        .select({
          id: sql<string>`${event.id}`.as("id"),
          projectId: workbenchActions.projectId,
          actionId: workbenchActions.id,
          prospectId: sql<string | null>`null`.as("prospectId"),
          fromStatus: workbenchActions.status,
          toStatus: sql<string>`${event.toStatus}`.as("toStatus"),
          note: sql<string>`${event.note}`.as("note"),
          createdAt: sql<string>`${event.createdAt}`.as("createdAt"),
        })
        .from(workbenchActions)
        .where(guard),
    ),
    tx
      .update(workbenchActions)
      .set({ ...patch, revision: action.revision + 1 })
      .where(guard),
  ]);
  return hasEvent(action.projectId, event.id);
}
async function listProspects(projectId: string) {
  return db
    .select()
    .from(backlinkProspects)
    .where(eq(backlinkProspects.projectId, projectId))
    .orderBy(desc(backlinkProspects.updatedAt), desc(backlinkProspects.id))
    .limit(501);
}
async function getProspect(
  projectId: string,
  prospectId: string,
): Promise<BacklinkProspect | null> {
  const [row] = await db
    .select()
    .from(backlinkProspects)
    .where(
      and(
        eq(backlinkProspects.projectId, projectId),
        eq(backlinkProspects.id, prospectId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function findProspect(
  projectId: string,
  sourceUrl: string,
  targetUrl: string,
): Promise<BacklinkProspect | null> {
  const [row] = await db
    .select()
    .from(backlinkProspects)
    .where(
      and(
        eq(backlinkProspects.projectId, projectId),
        eq(backlinkProspects.sourceUrl, sourceUrl),
        eq(backlinkProspects.targetUrl, targetUrl),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function insertProspect(prospect: ProspectInsert, event: EventInsert) {
  await runBatch((tx) => [
    tx.insert(backlinkProspects).values(prospect).onConflictDoNothing(),
    tx
      .insert(workbenchEvents)
      .select(
        tx
          .select({
            id: sql<string>`${event.id}`.as("id"),
            projectId: backlinkProspects.projectId,
            actionId: sql<string | null>`null`.as("actionId"),
            prospectId: backlinkProspects.id,
            fromStatus: sql<string | null>`null`.as("fromStatus"),
            toStatus: backlinkProspects.status,
            note: sql<string>`${event.note}`.as("note"),
            createdAt: sql<string>`${event.createdAt}`.as("createdAt"),
          })
          .from(backlinkProspects)
          .where(
            and(
              eq(backlinkProspects.id, prospect.id),
              eq(backlinkProspects.projectId, prospect.projectId),
            ),
          ),
      )
      .onConflictDoNothing(),
  ]);
}
async function changeProspect(
  prospect: BacklinkProspect,
  patch: Partial<ProspectInsert>,
  event: EventInsert,
) {
  const guard = and(
    eq(backlinkProspects.id, prospect.id),
    eq(backlinkProspects.projectId, prospect.projectId),
    eq(backlinkProspects.revision, prospect.revision),
  );
  await runBatch((tx) => [
    tx.insert(workbenchEvents).select(
      tx
        .select({
          id: sql<string>`${event.id}`.as("id"),
          projectId: backlinkProspects.projectId,
          actionId: sql<string | null>`null`.as("actionId"),
          prospectId: backlinkProspects.id,
          fromStatus: backlinkProspects.status,
          toStatus: sql<string>`${event.toStatus}`.as("toStatus"),
          note: sql<string>`${event.note}`.as("note"),
          createdAt: sql<string>`${event.createdAt}`.as("createdAt"),
        })
        .from(backlinkProspects)
        .where(guard),
    ),
    tx
      .update(backlinkProspects)
      .set({ ...patch, revision: prospect.revision + 1 })
      .where(guard),
  ]);
  return hasEvent(prospect.projectId, event.id);
}
async function hasEvent(projectId: string, eventId: string) {
  const [row] = await db
    .select({ id: workbenchEvents.id })
    .from(workbenchEvents)
    .where(
      and(
        eq(workbenchEvents.projectId, projectId),
        eq(workbenchEvents.id, eventId),
      ),
    )
    .limit(1);
  return !!row;
}
async function listEvents(
  projectId: string,
  ref: { actionId?: string; prospectId?: string },
) {
  return db
    .select()
    .from(workbenchEvents)
    .where(
      and(
        eq(workbenchEvents.projectId, projectId),
        ref.actionId ? eq(workbenchEvents.actionId, ref.actionId) : undefined,
        ref.prospectId
          ? eq(workbenchEvents.prospectId, ref.prospectId)
          : undefined,
      ),
    )
    .orderBy(desc(workbenchEvents.createdAt), desc(workbenchEvents.id))
    .limit(100);
}
async function latestCompletedAudit(
  projectId: string,
): Promise<Pick<
  typeof audits.$inferSelect,
  "id" | "startedAt" | "completedAt"
> | null> {
  const [row] = await db
    .select({
      id: audits.id,
      startedAt: audits.startedAt,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.startedAt), desc(audits.id))
    .limit(1);
  return row ?? null;
}
async function issuesForAudit(auditId: string) {
  return db
    .select()
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId))
    .limit(501);
}
async function auditPageEvidence(
  auditId: string,
  pageUrl: string,
  ruleId: string,
) {
  const [page] = await db
    .select({
      fetchClass: auditPages.fetchClass,
      statusCode: auditPages.statusCode,
      title: auditPages.title,
      isIndexable: auditPages.isIndexable,
    })
    .from(auditPages)
    .where(and(eq(auditPages.auditId, auditId), eq(auditPages.url, pageUrl)))
    .limit(1);
  const issues = await db
    .select({ type: auditIssues.issueType })
    .from(auditIssues)
    .where(
      and(eq(auditIssues.auditId, auditId), eq(auditIssues.pageUrl, pageUrl)),
    );
  return {
    page: page ?? null,
    issuePresent: issues.some((issue) => issue.type === ruleId),
    contentSkipped: issues.some(
      (issue) => issue.type === "javascript-rendering-suspected",
    ),
  };
}

export const WorkbenchRepository = {
  listActions,
  getAction,
  insertAction,
  changeAction,
  listProspects,
  getProspect,
  findProspect,
  insertProspect,
  changeProspect,
  listEvents,
  latestCompletedAudit,
  issuesForAudit,
  auditPageEvidence,
} as const;
