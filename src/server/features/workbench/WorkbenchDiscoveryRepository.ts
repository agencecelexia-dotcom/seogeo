import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  member,
  projects,
  user,
  workbenchDiscoverySettings as settings,
} from "@/db/schema";

async function get(
  projectId: string,
): Promise<typeof settings.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.projectId, projectId));
  return row ?? null;
}
async function save(input: typeof settings.$inferInsert) {
  await db
    .insert(settings)
    .values(input)
    .onConflictDoUpdate({ target: settings.projectId, set: input });
  return get(input.projectId);
}
async function listDue(stamp: string) {
  return db
    .select({
      settings,
      organizationId: projects.organizationId,
      userEmail: user.email,
    })
    .from(settings)
    .innerJoin(projects, eq(projects.id, settings.projectId))
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.organizationId),
        eq(member.userId, settings.authorizedByUserId),
      ),
    )
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(settings.enabled, true),
        lte(settings.nextRunAt, stamp),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(settings.nextRunAt)
    .limit(2);
}
async function claim(
  projectId: string,
  expectedNextRunAt: string,
  nextRunAt: string,
  stamp: string,
) {
  // Advance before paid calls so concurrent cron ticks cannot charge twice.
  const rows = await db
    .update(settings)
    .set({
      nextRunAt,
      lastRunAt: stamp,
      lastOutcome: "Recherche en cours…",
      updatedAt: stamp,
    })
    .where(
      and(
        eq(settings.projectId, projectId),
        eq(settings.enabled, true),
        eq(settings.nextRunAt, expectedNextRunAt),
      ),
    )
    .returning({ projectId: settings.projectId });
  return rows.length > 0;
}
async function finish(projectId: string, stamp: string, outcome: string) {
  await db
    .update(settings)
    .set({ lastOutcome: outcome })
    .where(
      and(eq(settings.projectId, projectId), eq(settings.lastRunAt, stamp)),
    );
}
export const WorkbenchDiscoveryRepository = {
  get,
  save,
  listDue,
  claim,
  finish,
};
