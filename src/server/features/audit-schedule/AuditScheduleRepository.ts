import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { auditSchedules, projects, member, user } from "@/db/schema";

async function list(organizationId: string) {
  return db
    .select({ schedule: auditSchedules })
    .from(auditSchedules)
    .innerJoin(projects, eq(projects.id, auditSchedules.projectId))
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    );
}
async function save(input: {
  projectId: string;
  authorizedByUserId: string;
  enabled: boolean;
  maxPages: number;
}) {
  const stamp = new Date().toISOString();
  // Editing settings does not bring forward an already scheduled run.
  await db
    .insert(auditSchedules)
    .values({ ...input, nextRunAt: stamp, updatedAt: stamp })
    .onConflictDoUpdate({
      target: auditSchedules.projectId,
      set: { ...input, updatedAt: stamp },
    });
}
async function due(stamp: string) {
  return db
    .select({
      schedule: auditSchedules,
      domain: projects.domain,
      organizationId: projects.organizationId,
      userEmail: user.email,
    })
    .from(auditSchedules)
    .innerJoin(projects, eq(projects.id, auditSchedules.projectId))
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.organizationId),
        eq(member.userId, auditSchedules.authorizedByUserId),
      ),
    )
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(auditSchedules.enabled, true),
        lte(auditSchedules.nextRunAt, stamp),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(auditSchedules.nextRunAt)
    .limit(2);
}
async function claim(projectId: string, expected: string, stamp: string) {
  const [row] = await db
    .update(auditSchedules)
    .set({
      nextRunAt: new Date(
        new Date(stamp).getTime() + 7 * 86400_000,
      ).toISOString(),
      lastRunAt: stamp,
      lastOutcome: "Démarrage de l’audit…",
      updatedAt: stamp,
    })
    .where(
      and(
        eq(auditSchedules.projectId, projectId),
        eq(auditSchedules.enabled, true),
        eq(auditSchedules.nextRunAt, expected),
      ),
    )
    .returning({ projectId: auditSchedules.projectId });
  return Boolean(row);
}
async function finish(
  projectId: string,
  stamp: string,
  outcome: string,
  retryAt?: string,
) {
  await db
    .update(auditSchedules)
    .set({ lastOutcome: outcome, ...(retryAt ? { nextRunAt: retryAt } : {}) })
    .where(
      and(
        eq(auditSchedules.projectId, projectId),
        eq(auditSchedules.lastRunAt, stamp),
      ),
    );
}
export const AuditScheduleRepository = { list, save, due, claim, finish };
