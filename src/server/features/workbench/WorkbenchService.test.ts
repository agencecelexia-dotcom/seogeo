import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchService } from "./WorkbenchService";
import {
  WorkbenchRepository,
  type BacklinkProspect,
  type WorkbenchAction,
} from "./WorkbenchRepository";
import { checkProspectLink } from "./checkProspectLink";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";

vi.mock("./WorkbenchRepository", () => ({
  WorkbenchRepository: {
    getAction: vi.fn(),
    changeAction: vi.fn(),
    latestCompletedAudit: vi.fn(),
    auditPageEvidence: vi.fn(),
    getProspect: vi.fn(),
    findProspect: vi.fn(),
    changeProspect: vi.fn(),
    insertProspect: vi.fn(),
  },
}));
vi.mock("./checkProspectLink", () => ({ checkProspectLink: vi.fn() }));
vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: { profileBacklinksPage: vi.fn() },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listCompetitors: vi.fn() } }),
);

const repository = vi.mocked(WorkbenchRepository);
const action = (overrides: Partial<WorkbenchAction> = {}): WorkbenchAction => ({
  id: "action",
  projectId: "project",
  title: "Titre manquant",
  pageUrl: "https://site.fr/page",
  evidenceUrl: null,
  evidenceText: "Audit",
  recommendation: "Ajouter un titre",
  source: "audit",
  sourceKey: "key",
  ruleId: "missing-title",
  status: "done",
  priority: "high",
  revision: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  completedAt: "2026-01-02T00:00:00.000Z",
  verifiedAt: null,
  ...overrides,
});
const prospect = (
  overrides: Partial<BacklinkProspect> = {},
): BacklinkProspect => ({
  id: "prospect",
  projectId: "project",
  sourceUrl: "https://source.fr/article",
  targetUrl: "https://site.fr/page",
  reason: "Mention existante",
  contactName: "",
  contactEmail: "",
  contactSourceUrl: null,
  draft: "Brouillon personnalisé",
  status: "acquired",
  revision: 0,
  checkStatus: "present",
  checkDetail: null,
  linkRel: null,
  lastCheckedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  repository.getAction.mockResolvedValue(action());
  repository.changeAction.mockResolvedValue(true);
  repository.getProspect.mockResolvedValue(prospect());
  repository.findProspect.mockResolvedValue(null);
  repository.changeProspect.mockResolvedValue(true);
  repository.insertProspect.mockResolvedValue(undefined);
  repository.latestCompletedAudit.mockResolvedValue(null);
  vi.mocked(checkProspectLink).mockResolvedValue({
    status: "error",
    detail: "HTTP 403",
    rel: null,
  });
  vi.mocked(ProjectContextRepository.listCompetitors).mockResolvedValue([]);
});

describe("action verification", () => {
  it("rejects an action outside the authorized project", async () => {
    repository.getAction.mockResolvedValue(null);
    await expect(
      WorkbenchService.updateActionStatus(
        "other-project",
        "action",
        "done",
        "",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.changeAction).not.toHaveBeenCalled();
  });
  it("requires completion before a documented verification", async () => {
    repository.getAction.mockResolvedValue(action({ status: "todo" }));
    await expect(
      WorkbenchService.updateActionStatus(
        "project",
        "action",
        "verified",
        "Capture confirmant la correction",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("does not infer verification without a later audit", async () => {
    expect(
      await WorkbenchService.verifyAction("project", "action"),
    ).toMatchObject({ verified: false });
    expect(repository.changeAction).not.toHaveBeenCalled();
  });
  it("keeps cross-page findings pending when crawl coverage can differ", async () => {
    repository.getAction.mockResolvedValue(
      action({ ruleId: "duplicate-title" }),
    );
    expect(
      await WorkbenchService.verifyAction("project", "action"),
    ).toMatchObject({ verified: false });
    expect(repository.latestCompletedAudit).not.toHaveBeenCalled();
  });
  it("rejects a concurrent update rather than overwriting it", async () => {
    repository.changeAction.mockResolvedValue(false);
    await expect(
      WorkbenchService.updateActionStatus("project", "action", "planned", ""),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("verifies an analyzed page only after the completed action and without the finding", async () => {
    repository.latestCompletedAudit.mockResolvedValue({
      id: "new-audit",
      startedAt: "2026-01-03T00:00:00.000Z",
      completedAt: "2026-01-03T00:10:00.000Z",
    });
    repository.auditPageEvidence.mockResolvedValue({
      page: {
        fetchClass: "ok",
        statusCode: 200,
        title: "Un titre corrigé",
        isIndexable: true,
      },
      issuePresent: false,
      contentSkipped: false,
    });
    expect(
      await WorkbenchService.verifyAction("project", "action"),
    ).toMatchObject({ verified: true });
    expect(repository.changeAction.mock.calls[0][1]).toMatchObject({
      status: "verified",
    });
  });
  it("does not infer a correction when JavaScript prevented content checks", async () => {
    repository.latestCompletedAudit.mockResolvedValue({
      id: "new-audit",
      startedAt: "2026-01-03T00:00:00.000Z",
      completedAt: "2026-01-03T00:10:00.000Z",
    });
    repository.auditPageEvidence.mockResolvedValue({
      page: {
        fetchClass: "ok",
        statusCode: 200,
        title: "App",
        isIndexable: true,
      },
      issuePresent: false,
      contentSkipped: true,
    });
    expect(
      await WorkbenchService.verifyAction("project", "action"),
    ).toMatchObject({ verified: false });
    expect(repository.changeAction).not.toHaveBeenCalled();
  });
});

describe("prospect evidence", () => {
  it("does not mark an acquired link lost when a check is blocked", async () => {
    const result = await WorkbenchService.recheckProspect(
      "project",
      "prospect",
    );
    expect(result.status).toBe("acquired");
    const patch = repository.changeProspect.mock.calls[0][1];
    expect(patch).toMatchObject({
      checkStatus: "error",
      checkDetail: "HTTP 403",
    });
    expect(patch).not.toHaveProperty("status");
  });
  it("preserves qualified work when discovery returns an existing URL pair", async () => {
    repository.findProspect.mockResolvedValue(prospect());
    const result = await WorkbenchService.saveProspect({
      projectId: "project",
      sourceUrl: "https://source.fr/article#section",
      targetUrl: "https://site.fr/page",
      reason: "New finding",
      contactName: "",
      contactEmail: "",
      draft: "",
    });
    expect(result).toMatchObject({
      created: false,
      prospect: { status: "acquired", draft: "Brouillon personnalisé" },
    });
    expect(repository.insertProspect).not.toHaveBeenCalled();
  });
  it("creates a deterministic draft with real source and target URLs", async () => {
    repository.findProspect
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(prospect());
    await WorkbenchService.saveProspect({
      projectId: "project",
      sourceUrl: "https://source.fr/article",
      targetUrl: "https://site.fr/page",
      reason: "Une ressource complémentaire sur le même sujet",
      contactName: "Alex",
      contactEmail: "",
      draft: "",
    });
    const saved = repository.insertProspect.mock.calls[0][0];
    expect(saved.draft).toContain("Bonjour Alex");
    expect(saved.draft).toContain("https://source.fr/article");
    expect(saved.draft).toContain("https://site.fr/page");
    expect(saved.status).toBe("discovered");
  });
  it("does not use a paid provider without configured competitors", async () => {
    expect(
      await WorkbenchService.discoverProspects(
        "project",
        "https://site.fr/page",
        { organizationId: "org", userId: "user", userEmail: "user@site.fr" },
      ),
    ).toMatchObject({ competitors: 0, added: 0 });
    expect(
      vi.mocked(BacklinksService).profileBacklinksPage.mock.calls,
    ).toHaveLength(0);
  });
});
