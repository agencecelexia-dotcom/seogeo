import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
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
async function runDue() {
  const stamp = new Date().toISOString();
  const due = await repository.listDue(stamp);
  let processed = 0;
  for (const row of due) {
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
      continue;
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
      );
      await repository.finish(
        row.settings.projectId,
        stamp,
        result.competitors
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
    processed++;
  }
  return { processed };
}
export const WorkbenchDiscoveryService = { getSettings, saveSettings, runDue };
