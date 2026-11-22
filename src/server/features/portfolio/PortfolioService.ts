import { sortBy } from "remeda";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { PortfolioRepository } from "./PortfolioRepository";
import { buildPageDossiers } from "@/shared/page-dossiers";
import { DataRefreshClaimRepository } from "@/server/features/dashboard/repositories/DataRefreshClaimRepository";

const INITIAL_SITES = [
  { name: "Agence Celexia", domain: "agencecelexia.fr" },
  { name: "Rénovation Metbach", domain: "renovationmetbach.fr" },
  { name: "ArtisansFrance", domain: "artisansfrance.fr" },
];

async function overview(organizationId: string) {
  const projects = await PortfolioRepository.listProjects(organizationId);
  const sites = await Promise.all(
    projects.map(async (project) => ({
      id: project.id,
      name: project.name,
      domain: project.domain,
      ...(await PortfolioRepository.projectSummary(project.id)),
    })),
  );
  const priorities = sortBy(
    sites.flatMap((site) =>
      site.actions.map((action) => ({ ...action, projectName: site.name })),
    ),
    (row) => ({ high: 0, medium: 1, low: 2 })[row.priority],
    [(row) => row.updatedAt, "desc"],
  );
  return {
    sites,
    priorities: priorities.slice(0, 20),
    generatedAt: new Date().toISOString(),
  };
}

// Explicit onboarding only: opening the cockpit never starts paid work.
async function addInitialSites(organizationId: string) {
  const key = `portfolio:initial-sites:${organizationId}`;
  const token = await DataRefreshClaimRepository.claim(key, organizationId);
  if (!token) return { created: 0 };
  try {
    const existing = await PortfolioRepository.listProjects(organizationId);
    const created = [];
    for (const site of INITIAL_SITES) {
      if (existing.some((project) => project.domain === site.domain)) continue;
      created.push(
        await ProjectService.createProject(organizationId, {
          ...site,
          locationCode: 2250,
          languageCode: "fr",
        }),
      );
    }
    return { created: created.length };
  } finally {
    await DataRefreshClaimRepository.finish(key, token, 0);
  }
}

async function pageEvidence(organizationId: string, projectId: string) {
  const project = await ProjectService.getProjectForOrganization(
    organizationId,
    projectId,
  );
  const since = new Date(Date.now() - 28 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const evidence = await PortfolioRepository.pageEvidence(projectId, since);
  return {
    project,
    since,
    audit: evidence.audit,
    pages: buildPageDossiers(evidence),
    limited:
      evidence.pages.length === 1000 ||
      evidence.metrics.length === 30000 ||
      evidence.geo.length === 2000 ||
      evidence.links.length === 2000 ||
      evidence.actions.length === 1000,
  };
}

export const PortfolioService = { overview, addInitialSites, pageEvidence };
