import { WorkbenchRepository as repository } from "./WorkbenchRepository";
import { AppError } from "@/server/lib/errors";
import { cleanUrl } from "./cleanUrl";
const now = () => new Date().toISOString();
import type { BacklinkProspect } from "./WorkbenchRepository";
import { checkProspectLink } from "./checkProspectLink";
import type {
  ProspectStatus,
  SaveProspectInput,
} from "@/types/schemas/workbench";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import type { BillingCustomerContext } from "@/server/billing/subscription";
function prospectEvent(
  prospect: Pick<BacklinkProspect, "id" | "projectId" | "status">,
  status: ProspectStatus,
  note: string,
  stamp: string,
) {
  return {
    id: crypto.randomUUID(),
    projectId: prospect.projectId,
    actionId: null,
    prospectId: prospect.id,
    fromStatus: prospect.status,
    toStatus: status,
    note,
    createdAt: stamp,
  };
}
async function requireProspect(projectId: string, prospectId: string) {
  const prospect = await repository.getProspect(projectId, prospectId);
  if (!prospect) throw new AppError("NOT_FOUND");
  return prospect;
}

async function listProspects(projectId: string) {
  const rows = await repository.listProspects(projectId);
  return { prospects: rows.slice(0, 500), truncated: rows.length > 500 };
}
function makeDraft(
  input: Pick<
    SaveProspectInput,
    "sourceUrl" | "targetUrl" | "reason" | "contactName"
  >,
) {
  return `Bonjour${input.contactName ? ` ${input.contactName}` : ""},\n\nJ’ai consulté votre page ${input.sourceUrl}.\n\n${input.reason}\n\nSi cela vous semble pertinent pour vos lecteurs, voici la ressource que je souhaitais vous proposer : ${input.targetUrl}\n\nMerci pour votre temps,\n[Votre nom]`;
}
async function saveProspect(input: SaveProspectInput) {
  const sourceUrl = cleanUrl(input.sourceUrl);
  const targetUrl = cleanUrl(input.targetUrl);
  const duplicate = await repository.findProspect(
    input.projectId,
    sourceUrl,
    targetUrl,
  );
  if (duplicate && duplicate.id !== input.prospectId) {
    if (input.prospectId) throw new AppError("CONFLICT");
    return { prospect: duplicate, created: false };
  }
  const stamp = now();
  const data = {
    sourceUrl,
    targetUrl,
    reason: input.reason,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactSourceUrl: input.contactSourceUrl || null,
    draft: input.draft || makeDraft({ ...input, sourceUrl, targetUrl }),
    updatedAt: stamp,
  };
  if (input.prospectId) {
    const prospect = await requireProspect(input.projectId, input.prospectId);
    const urlsChanged =
      sourceUrl !== prospect.sourceUrl || targetUrl !== prospect.targetUrl;
    const changed = await repository.changeProspect(
      prospect,
      {
        ...data,
        ...(urlsChanged
          ? {
              checkStatus: "unchecked" as const,
              checkDetail: null,
              linkRel: null,
              lastCheckedAt: null,
            }
          : {}),
      },
      prospectEvent(
        prospect,
        prospect.status,
        "Fiche et brouillon modifiés.",
        stamp,
      ),
    );
    if (!changed) throw new AppError("CONFLICT");
    return {
      prospect: await requireProspect(input.projectId, prospect.id),
      created: false,
    };
  }
  const id = crypto.randomUUID();
  const prospect = {
    ...data,
    id,
    projectId: input.projectId,
    status: "discovered" as const,
    createdAt: stamp,
  };
  await repository.insertProspect(prospect, {
    ...prospectEvent(
      prospect,
      "discovered",
      "Prospect enregistré. Le message reste un brouillon.",
      stamp,
    ),
    id: `${id}:created`,
    fromStatus: null,
  });
  const stored = await repository.findProspect(
    input.projectId,
    sourceUrl,
    targetUrl,
  );
  if (!stored) throw new AppError("INTERNAL_ERROR");
  return { prospect: stored, created: stored.id === id };
}
async function updateProspectStatus(
  projectId: string,
  prospectId: string,
  status: ProspectStatus,
  note: string,
) {
  const prospect = await requireProspect(projectId, prospectId);
  if (prospect.status === status) return prospect;
  const stamp = now();
  const changed = await repository.changeProspect(
    prospect,
    { status, updatedAt: stamp },
    prospectEvent(
      prospect,
      status,
      note || "Statut confirmé manuellement.",
      stamp,
    ),
  );
  if (!changed) throw new AppError("CONFLICT");
  return requireProspect(projectId, prospectId);
}
async function recheckProspect(projectId: string, prospectId: string) {
  const prospect = await requireProspect(projectId, prospectId);
  const check = await checkProspectLink(prospect.sourceUrl, prospect.targetUrl);
  const stamp = now();
  const changed = await repository.changeProspect(
    prospect,
    {
      checkStatus: check.status,
      checkDetail: check.detail,
      linkRel: check.rel,
      lastCheckedAt: stamp,
      updatedAt: stamp,
    },
    prospectEvent(
      prospect,
      prospect.status,
      `Contrôle HTML : ${check.detail}`,
      stamp,
    ),
  );
  if (!changed) throw new AppError("CONFLICT");
  return requireProspect(projectId, prospectId);
}
async function listProspectEvents(projectId: string, prospectId: string) {
  await requireProspect(projectId, prospectId);
  return repository.listEvents(projectId, { prospectId });
}

async function discoverProspects(
  projectId: string,
  targetUrl: string,
  billing: BillingCustomerContext,
  options: { deadlineAt?: number } = {},
) {
  const competitors = (
    await ProjectContextRepository.listCompetitors(projectId)
  ).slice(0, 3);
  let added = 0;
  let observed = 0;
  let skipped = 0;
  let processedCompetitors = 0;
  let timeLimited = false;
  const remaining = () =>
    options.deadlineAt === undefined
      ? Infinity
      : options.deadlineAt - Date.now();
  for (const competitor of competitors) {
    // Reserve the provider's 60s timeout plus 30s for SQL and the final outcome.
    if (remaining() < 90_000) {
      timeLimited = true;
      break;
    }
    const result = await BacklinksService.profileBacklinksPage(
      {
        target: competitor.domain,
        scope: "domain",
        page: 1,
        pageSize: 100,
        sortField: "domainRank",
        sortOrder: "desc",
        filters: { hideLost: true, hideBroken: true },
        mode: "one_per_domain",
      },
      billing,
      { hideSpam: false },
    );
    processedCompetitors++;
    for (const row of result.rows.slice(0, 100)) {
      // SQL cannot be cancelled safely after dispatch; stop before another write.
      if (remaining() < 30_000) {
        timeLimited = true;
        break;
      }
      observed++;
      if (!row.urlFrom || !row.urlTo) {
        skipped++;
        continue;
      }
      let source: URL;
      try {
        source = new URL(row.urlFrom);
      } catch {
        skipped++;
        continue;
      }
      if (
        !["http:", "https:"].includes(source.protocol) ||
        source.username ||
        source.password
      ) {
        skipped++;
        continue;
      }
      const saved = await saveProspect({
        projectId,
        sourceUrl: source.href,
        targetUrl,
        reason: `Cette page référence ${competitor.domain} (${row.urlTo}), selon DataForSEO, collecte du ${result.fetchedAt}. Vérifier sa pertinence éditoriale et si elle cite déjà notre site avant de contacter son auteur.`,
        contactName: "",
        contactEmail: "",
        contactSourceUrl: null,
        draft: "",
      });
      if (saved.created) added++;
    }
    if (timeLimited) break;
  }
  return {
    competitors: processedCompetitors,
    configuredCompetitors: competitors.length,
    observed,
    added,
    skipped,
    timeLimited,
  };
}

export const BacklinkProspectService = {
  listProspects,
  saveProspect,
  updateProspectStatus,
  recheckProspect,
  listProspectEvents,
  discoverProspects,
};
