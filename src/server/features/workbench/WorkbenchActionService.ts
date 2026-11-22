import { WorkbenchRepository as repository } from "./WorkbenchRepository";
import { AppError } from "@/server/lib/errors";
import { cleanUrl } from "./cleanUrl";
const now = () => new Date().toISOString();
import type { WorkbenchAction } from "./WorkbenchRepository";
import { sha256Hex } from "@/server/lib/audit/ids";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type {
  ActionStatus,
  CreateActionInput,
} from "@/types/schemas/workbench";
function actionEvent(
  action: Pick<WorkbenchAction, "id" | "projectId" | "status">,
  status: ActionStatus,
  note: string,
  stamp: string,
) {
  return {
    id: crypto.randomUUID(),
    projectId: action.projectId,
    actionId: action.id,
    prospectId: null,
    fromStatus: action.status,
    toStatus: status,
    note,
    createdAt: stamp,
  };
}
async function requireAction(projectId: string, actionId: string) {
  const action = await repository.getAction(projectId, actionId);
  if (!action) throw new AppError("NOT_FOUND");
  return action;
}
async function listActions(projectId: string) {
  const rows = await repository.listActions(projectId);
  return { actions: rows.slice(0, 500), truncated: rows.length > 500 };
}
async function createAction(input: CreateActionInput) {
  const stamp = now();
  const id = crypto.randomUUID();
  const action = {
    ...input,
    id,
    pageUrl: cleanUrl(input.pageUrl),
    evidenceUrl: input.evidenceUrl || null,
    source: "manual" as const,
    sourceKey: id,
    status: "todo" as const,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await repository.insertAction(action, {
    ...actionEvent(action, "todo", "Action créée manuellement.", stamp),
    id: `${id}:created`,
    fromStatus: null,
  });
  return requireAction(input.projectId, id);
}
async function updateActionStatus(
  projectId: string,
  actionId: string,
  status: ActionStatus,
  note: string,
) {
  const action = await requireAction(projectId, actionId);
  if (action.status === status) return action;
  if (
    status === "verified" &&
    (action.status !== "done" || note.trim().length < 10)
  )
    throw new AppError("VALIDATION_ERROR");
  const stamp = now();
  const changed = await repository.changeAction(
    action,
    {
      status,
      completedAt:
        status === "done"
          ? stamp
          : status === "verified"
            ? action.completedAt
            : null,
      verifiedAt: status === "verified" ? stamp : null,
      updatedAt: stamp,
    },
    actionEvent(action, status, note || "Statut mis à jour.", stamp),
  );
  if (!changed) throw new AppError("CONFLICT");
  return requireAction(projectId, actionId);
}
async function importAuditActions(projectId: string) {
  const audit = await repository.latestCompletedAudit(projectId);
  if (!audit) return { added: 0, auditId: null, truncated: false };
  const issues = await repository.issuesForAudit(audit.id);
  let added = 0;
  for (const issue of issues.slice(0, 500)) {
    const sourceKey = await sha256Hex(
      JSON.stringify([issue.issueType, issue.pageUrl]),
    );
    const id = await sha256Hex(JSON.stringify([projectId, "audit", sourceKey]));
    if (await repository.getAction(projectId, id)) continue;
    const descriptor = getIssueDescriptor(issue.issueType);
    const stamp = now();
    const action = {
      id,
      projectId,
      title: descriptor?.title ?? issue.issueType,
      pageUrl: issue.pageUrl,
      evidenceUrl: issue.pageUrl,
      evidenceText: `Audit ${audit.id}, terminé le ${audit.completedAt ?? audit.startedAt}. ${descriptor?.explanation ?? issue.issueType}`,
      recommendation:
        descriptor?.howToFix ??
        "Examiner cette anomalie dans le rapport d’audit, corriger puis relancer un contrôle.",
      source: "audit" as const,
      sourceKey,
      ruleId: issue.issueType,
      priority:
        issue.severity === "critical"
          ? ("high" as const)
          : issue.severity === "warning"
            ? ("medium" as const)
            : ("low" as const),
      status: "todo" as const,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await repository.insertAction(action, {
      ...actionEvent(action, "todo", `Import de l’audit ${audit.id}.`, stamp),
      id: `${id}:created`,
      fromStatus: null,
    });
    added++;
  }
  return { added, auditId: audit.id, truncated: issues.length > 500 };
}
async function verifyAction(projectId: string, actionId: string) {
  const action = await requireAction(projectId, actionId);
  if (
    action.status !== "done" ||
    !action.completedAt ||
    !action.ruleId ||
    action.source !== "audit"
  )
    throw new AppError("VALIDATION_ERROR");
  // Cross-page findings need a comparable crawl scope; absence alone is not proof.
  const pageRules = new Set([
    "blocked-page",
    "rate-limited-page",
    "server-error",
    "broken-page",
    "javascript-rendering-suspected",
    "slow-response",
    "noindex-page",
    "canonical-conflict",
    "canonicalized-page",
    "missing-title",
    "title-too-long",
    "title-too-short",
    "missing-meta-description",
    "meta-description-too-long",
    "meta-description-too-short",
    "missing-h1",
    "multiple-h1",
    "heading-order-skip",
    "thin-content",
    "images-missing-alt",
    "no-outgoing-links",
  ]);
  if (!pageRules.has(action.ruleId))
    return {
      verified: false,
      reason:
        "Cette anomalie nécessite une vérification manuelle documentée : la couverture entre audits peut varier.",
    };
  const audit = await repository.latestCompletedAudit(projectId);
  if (!audit || Date.parse(audit.startedAt) <= Date.parse(action.completedAt))
    return {
      verified: false,
      reason: "Relancez un audit après la réalisation de cette action.",
    };
  const evidence = await repository.auditPageEvidence(
    audit.id,
    action.pageUrl,
    action.ruleId,
  );
  if (
    !evidence.page ||
    evidence.page.fetchClass !== "ok" ||
    !evidence.page.statusCode ||
    evidence.page.statusCode < 200 ||
    evidence.page.statusCode >= 300 ||
    !evidence.page.title ||
    !evidence.page.isIndexable ||
    evidence.contentSkipped
  )
    return {
      verified: false,
      reason:
        "La page n’a pas été contrôlée correctement dans le dernier audit.",
    };
  if (evidence.issuePresent)
    return {
      verified: false,
      reason: "L’anomalie est toujours présente dans le dernier audit.",
    };
  await updateActionStatus(
    projectId,
    actionId,
    "verified",
    `Contrôle de l’audit ${audit.id} : page effectivement analysée, anomalie ${action.ruleId} non retrouvée. Cela ne mesure pas un gain de classement.`,
  );
  return {
    verified: true,
    reason: "L’anomalie n’a pas été retrouvée dans le nouvel audit.",
  };
}
async function listActionEvents(projectId: string, actionId: string) {
  await requireAction(projectId, actionId);
  return repository.listEvents(projectId, { actionId });
}
export const WorkbenchActionService = {
  listActions,
  createAction,
  updateActionStatus,
  importAuditActions,
  verifyAction,
  listActionEvents,
};
