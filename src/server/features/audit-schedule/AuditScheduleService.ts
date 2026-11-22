import { AuditScheduleRepository as repository } from "./AuditScheduleRepository";
import { AuditService } from "@/server/features/audit/services/AuditService";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";

async function runDue(now = new Date()) {
  const stamp = now.toISOString();
  const due = await repository.due(stamp);
  for (const { schedule, domain, organizationId, userEmail } of due) {
    if (
      !(await repository.claim(schedule.projectId, schedule.nextRunAt, stamp))
    )
      continue;
    try {
      if (!domain) {
        await repository.finish(
          schedule.projectId,
          stamp,
          "Ajoutez le domaine du site pour lancer un audit.",
        );
        continue;
      }
      const latest = await AuditRepository.getLatestAuditForProject(
        schedule.projectId,
      );
      if (latest?.status === "running") {
        await repository.finish(
          schedule.projectId,
          stamp,
          "Un audit est déjà en cours. Nouveau passage dans une heure.",
          new Date(now.getTime() + 3600_000).toISOString(),
        );
        continue;
      }
      const customer = {
        organizationId,
        projectId: schedule.projectId,
        userId: schedule.authorizedByUserId,
        userEmail,
      };
      await AuditService.startAudit({
        actorUserId: customer.userId,
        billingCustomer: customer,
        projectId: schedule.projectId,
        startUrl: `https://${domain}`,
        maxPages: schedule.maxPages,
        renderJavaScript: false,
        lighthouseStrategy: "none",
        limitTier: await AuditService.resolveAuditLimitTier(customer),
      });
      await repository.finish(
        schedule.projectId,
        stamp,
        `Audit HTML démarré, jusqu’à ${schedule.maxPages} pages. Résultats dans Site Audit.`,
      );
    } catch {
      await repository.finish(
        schedule.projectId,
        stamp,
        "Démarrage impossible. Vérifiez le domaine et la capacité des audits ; nouvelle tentative dans une heure.",
        new Date(now.getTime() + 3600_000).toISOString(),
      );
    }
  }
}
export const AuditScheduleService = {
  runDue,
  list: repository.list,
  configure: repository.save,
};
