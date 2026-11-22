import { sortBy } from "remeda";
import { WeeklyReviewRepository } from "./WeeklyReviewRepository";

async function generate(organizationId: string) {
  const generatedAt = new Date().toISOString();
  const periodStart = new Date(
    Date.parse(generatedAt) - 7 * 86400_000,
  ).toISOString();
  const data = await WeeklyReviewRepository.evidence(
    organizationId,
    periodStart,
    generatedAt,
  );
  const activity = [
    ...data.completedAudits.slice(0, 500).map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      category: "Audit terminé",
      occurredAt: row.completedAt!,
      title: row.startUrl,
      detail: `${row.pagesCrawled} page(s) explorée(s), ${row.pagesTotal} page(s) découvertes. Une fin d’audit ne garantit pas une couverture complète.`,
      url: row.startUrl,
    })),
    ...data.events.slice(0, 500).map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      category: row.actionTitle ? "Action" : "Prospect",
      occurredAt: row.createdAt,
      title: row.actionTitle ?? row.prospectUrl ?? "Historique",
      detail: `${row.fromStatus ?? "Création"} → ${row.toStatus}. ${row.note}`,
      url: row.actionUrl ?? row.prospectUrl,
    })),
    ...data.imports.slice(0, 500).map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      category: "Import",
      occurredAt: row.createdAt,
      title: row.source,
      detail: `Statut ${row.status} ; ${row.rowCount} ligne(s). Données du ${row.periodStart} au ${row.periodEnd}.`,
      url: null,
    })),
    ...data.runs.slice(0, 500).map(({ projectId, projectName, run }) => ({
      id: run.id,
      projectId,
      projectName,
      category: "Collecte Google",
      occurredAt: run.startedAt,
      title: run.source,
      detail: `Statut ${run.status} ; couverture ${run.coverage}. Période ${run.startDate} — ${run.endDate}, fuseau ${run.sourceTimeZone}. ${run.errorCode ? `Erreur : ${run.errorCode}.` : ""}`,
      url: null,
    })),
  ];
  return {
    generatedAt,
    periodStart,
    periodEnd: generatedAt,
    activity: sortBy(activity, [(row) => row.occurredAt, "desc"]),
    coverage: data.coverage.slice(0, 500),
    priorities: data.priorities.slice(0, 20),
    limited:
      data.completedAudits.length > 500 ||
      data.events.length > 500 ||
      data.imports.length > 500 ||
      data.runs.length > 500 ||
      data.coverage.length > 500 ||
      data.priorities.length > 20,
    interpretation:
      "Cette revue décrit les opérations et leurs preuves enregistrées. Elle ne calcule aucune variation de trafic : les sources, périodes et couvertures peuvent différer. Les priorités et la couverture sont leur état actuel, même si leur dernière mise à jour précède la semaine.",
  };
}
export const WeeklyReviewService = { generate };
