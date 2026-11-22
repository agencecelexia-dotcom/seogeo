import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
import { sha256Hex } from "@/server/lib/audit/ids";
import { WorkbenchDiscoveryRepository as repository } from "./WorkbenchDiscoveryRepository";
import { WorkbenchService } from "./WorkbenchService";

async function getSettings(projectId: string) {
  return repository.get(projectId);
}
async function saveSettings(
  input: { projectId: string; enabled: boolean; targetUrl: string },
  context: BillingCustomerContext,
) {
  if (
    input.enabled &&
    !(await ProjectContextRepository.listCompetitors(input.projectId)).length
  )
    throw new AppError("VALIDATION_ERROR");
  const existing = await repository.get(input.projectId);
  const stamp = new Date().toISOString();
  return repository.save({
    ...input,
    authorizedByUserId: context.userId,
    nextRunAt: existing?.enabled ? existing.nextRunAt : stamp,
    updatedAt: stamp,
  });
}
async function runProject(
  row: Awaited<ReturnType<typeof repository.listDue>>[number],
  stamp: string,
  deadlineAt?: number,
) {
  const next = new Date(stamp);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  if (
    !(await repository.claim(
      row.settings.projectId,
      row.settings.nextRunAt,
      next.toISOString(),
      stamp,
    ))
  )
    return false;
  try {
    const result = await WorkbenchService.discoverProspects(
      row.settings.projectId,
      row.settings.targetUrl,
      {
        projectId: row.settings.projectId,
        organizationId: row.organizationId,
        userId: row.settings.authorizedByUserId,
        userEmail: row.userEmail,
      },
      deadlineAt === undefined ? undefined : { deadlineAt },
    );
    await repository.finish(
      row.settings.projectId,
      stamp,
      result.timeLimited
        ? `Collecte partielle : ${result.competitors}/${result.configuredCompetitors} concurrent(s) consulté(s), ${result.added} prospect(s) ajouté(s), ${result.observed} lien(s) examiné(s). Limite de temps atteinte ; les résultats déjà importés sont conservés. La prochaine collecte mensuelle est conservée.`
        : result.competitors
          ? `${result.added} prospect(s) ajouté(s), ${result.observed} lien(s) examiné(s).`
          : "Aucun concurrent configuré. Ajoutez des concurrents avant la prochaine collecte.",
    );
  } catch {
    // A provider may have charged before failing: no automatic retry this month.
    await repository.finish(
      row.settings.projectId,
      stamp,
      "Recherche interrompue. Vérifiez les clés et le budget ; relancez manuellement si nécessaire. La prochaine collecte mensuelle est conservée.",
    );
  }
  return true;
}
async function runQueued(projectId: string, expectedNextRunAt: string) {
  const deadlineAt = Date.now() + 220_000;
  // Queue data is only an identity. Authorization, enabled/archive state and
  // the exact monthly slot must still be current when paid work begins.
  const row = await repository.findDueProject(projectId, expectedNextRunAt);
  if (!row) return { processed: 0 };
  const processed = await runProject(row, new Date().toISOString(), deadlineAt);
  return { processed: processed ? 1 : 0 };
}
async function runDue() {
  const stamp = new Date().toISOString();
  const due = await repository.listDue(stamp);
  if (process.env.RUNTIME_PLATFORM === "vercel") {
    const { createWorkflowBinding } = await import("@/server/vercel/workflows");
    const { WorkflowStore } = await import("@/server/vercel/workflowStore");
    const binding = createWorkflowBinding<{
      projectId: string;
      expectedNextRunAt: string;
    }>("backlink-discovery");
    let queued = 0;
    for (const row of due) {
      const params = {
        projectId: row.settings.projectId,
        expectedNextRunAt: row.settings.nextRunAt,
      };
      // A skipped/revoked intent may be reconsidered tomorrow. The exact
      // monthly CAS still prevents two paid collections for that same slot.
      const id = await sha256Hex(JSON.stringify([params, stamp.slice(0, 10)]));
      if (await WorkflowStore.getJob(`backlink-discovery:${id}`)) continue;
      // Persistence precedes monthly claiming and every provider request.
      await binding.create({ id, params });
      queued++;
    }
    return { processed: 0, queued };
  }
  let processed = 0;
  for (const row of due) {
    if (await runProject(row, stamp)) processed++;
  }
  return { processed };
}
export const WorkbenchDiscoveryService = {
  getSettings,
  saveSettings,
  runDue,
  runQueued,
};
