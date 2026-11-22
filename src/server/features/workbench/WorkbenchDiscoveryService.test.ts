import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbenchDiscoveryService } from "./WorkbenchDiscoveryService";
import { WorkbenchDiscoveryRepository } from "./WorkbenchDiscoveryRepository";
import { WorkbenchService } from "./WorkbenchService";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { WorkflowStore } from "@/server/vercel/workflowStore";

const queue = vi.hoisted(() => ({
  create:
    vi.fn<
      (input: {
        id: string;
        params: { projectId: string; expectedNextRunAt: string };
      }) => Promise<{ id: string }>
    >(),
}));
vi.mock("@/server/vercel/workflows", () => ({
  createWorkflowBinding: () => ({ create: queue.create }),
}));
vi.mock("@/server/vercel/workflowStore", () => ({
  WorkflowStore: { getJob: vi.fn() },
}));

vi.mock("./WorkbenchDiscoveryRepository", () => ({
  WorkbenchDiscoveryRepository: {
    get: vi.fn(),
    save: vi.fn(),
    listDue: vi.fn(),
    findDueProject: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
  },
}));
vi.mock("./WorkbenchService", () => ({
  WorkbenchService: { discoverProspects: vi.fn() },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listCompetitors: vi.fn() } }),
);
const repository = vi.mocked(WorkbenchDiscoveryRepository);
const settings = {
  projectId: "project",
  authorizedByUserId: "author",
  enabled: true,
  targetUrl: "https://site.fr/page",
  nextRunAt: "2026-01-31T08:00:00.000Z",
  lastRunAt: null,
  lastOutcome: null,
  updatedAt: "2026-01-30T08:00:00.000Z",
};
beforeEach(() => {
  vi.stubEnv("RUNTIME_PLATFORM", "cloudflare");
  vi.useFakeTimers();
  vi.setSystemTime("2026-01-31T08:00:00.000Z");
  repository.get.mockResolvedValue(null);
  repository.listDue.mockResolvedValue([
    { settings, organizationId: "org", userEmail: "author@site.fr" },
  ]);
  repository.findDueProject.mockResolvedValue({
    settings,
    organizationId: "org",
    userEmail: "author@site.fr",
  });
  repository.claim.mockResolvedValue(true);
  repository.finish.mockResolvedValue(undefined);
  vi.mocked(WorkbenchService.discoverProspects).mockResolvedValue({
    competitors: 1,
    configuredCompetitors: 1,
    timeLimited: false,
    observed: 10,
    added: 3,
    skipped: 0,
  });
  vi.mocked(ProjectContextRepository.listCompetitors).mockResolvedValue([]);
  vi.mocked(WorkflowStore.getJob).mockResolvedValue(null);
  queue.create.mockResolvedValue({ id: "job" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("requires configured competitors before enabling paid discovery", async () => {
  await expect(
    WorkbenchDiscoveryService.saveSettings(
      {
        projectId: "project",
        enabled: true,
        targetUrl: "https://site.fr/page",
      },
      { organizationId: "org", userId: "author", userEmail: "author@site.fr" },
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(repository.save).not.toHaveBeenCalled();
});
it("does not charge when another scheduler already claimed the run", async () => {
  repository.claim.mockResolvedValue(false);
  expect(await WorkbenchDiscoveryService.runDue()).toEqual({ processed: 0 });
  expect(WorkbenchService.discoverProspects).not.toHaveBeenCalled();
});
it("advances January 31 into February and preserves project billing context", async () => {
  expect(await WorkbenchDiscoveryService.runDue()).toEqual({ processed: 1 });
  expect(repository.claim).toHaveBeenCalledWith(
    "project",
    settings.nextRunAt,
    "2026-02-28T08:00:00.000Z",
    settings.nextRunAt,
  );
  expect(WorkbenchService.discoverProspects).toHaveBeenCalledWith(
    "project",
    "https://site.fr/page",
    {
      projectId: "project",
      organizationId: "org",
      userId: "author",
      userEmail: "author@site.fr",
    },
    undefined,
  );
});
it("only persists a project job in the Vercel scheduler before any monthly claim or paid call", async () => {
  vi.stubEnv("RUNTIME_PLATFORM", "vercel");
  expect(await WorkbenchDiscoveryService.runDue()).toEqual({
    processed: 0,
    queued: 1,
  });
  expect(queue.create).toHaveBeenCalledTimes(1);
  expect(queue.create.mock.calls[0][0].params).toEqual({
    projectId: "project",
    expectedNextRunAt: settings.nextRunAt,
  });
  expect(queue.create.mock.calls[0][0].id).toMatch(/^[a-f0-9]{64}$/);
  expect(repository.claim).not.toHaveBeenCalled();
  expect(WorkbenchService.discoverProspects).not.toHaveBeenCalled();
});
it("skips queued work that is no longer due or authorized", async () => {
  repository.findDueProject.mockResolvedValue(null);
  expect(
    await WorkbenchDiscoveryService.runQueued("project", settings.nextRunAt),
  ).toEqual({ processed: 0 });
  expect(repository.claim).not.toHaveBeenCalled();
  expect(WorkbenchService.discoverProspects).not.toHaveBeenCalled();
});
it("deduplicates today's intent and revisits an unclaimed monthly slot the next day", async () => {
  vi.stubEnv("RUNTIME_PLATFORM", "vercel");
  await WorkbenchDiscoveryService.runDue();
  await WorkbenchDiscoveryService.runDue();
  vi.setSystemTime("2026-02-01T08:00:00.000Z");
  await WorkbenchDiscoveryService.runDue();
  expect(queue.create.mock.calls[0][0].id).toBe(
    queue.create.mock.calls[1][0].id,
  );
  expect(queue.create.mock.calls[0][0].id).not.toBe(
    queue.create.mock.calls[2][0].id,
  );
});
it("keeps the monthly claim and records a time-limited queued collection explicitly", async () => {
  vi.mocked(WorkbenchService.discoverProspects).mockResolvedValue({
    competitors: 1,
    configuredCompetitors: 3,
    timeLimited: true,
    observed: 50,
    added: 7,
    skipped: 0,
  });
  expect(
    await WorkbenchDiscoveryService.runQueued("project", settings.nextRunAt),
  ).toEqual({ processed: 1 });
  expect(
    vi.mocked(WorkbenchService.discoverProspects).mock.calls[0][3]?.deadlineAt,
  ).toBe(Date.now() + 220000);
  expect(repository.finish).toHaveBeenCalledWith(
    "project",
    settings.nextRunAt,
    "Collecte partielle : 1/3 concurrent(s) consulté(s), 7 prospect(s) ajouté(s), 50 lien(s) examiné(s). Limite de temps atteinte ; les résultats déjà importés sont conservés. La prochaine collecte mensuelle est conservée.",
  );
});
it("records a failed paid call without automatically retrying it", async () => {
  vi.mocked(WorkbenchService.discoverProspects).mockRejectedValue(
    new Error("Provider unavailable"),
  );
  expect(await WorkbenchDiscoveryService.runDue()).toEqual({ processed: 1 });
  expect(WorkbenchService.discoverProspects).toHaveBeenCalledTimes(1);
  expect(repository.finish).toHaveBeenCalledWith(
    "project",
    settings.nextRunAt,
    expect.stringContaining("Recherche interrompue"),
  );
});
