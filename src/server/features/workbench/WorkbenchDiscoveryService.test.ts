import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbenchDiscoveryService } from "./WorkbenchDiscoveryService";
import { WorkbenchDiscoveryRepository } from "./WorkbenchDiscoveryRepository";
import { WorkbenchService } from "./WorkbenchService";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";

vi.mock("./WorkbenchDiscoveryRepository", () => ({
  WorkbenchDiscoveryRepository: {
    get: vi.fn(),
    save: vi.fn(),
    listDue: vi.fn(),
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
  vi.useFakeTimers();
  vi.setSystemTime("2026-01-31T08:00:00.000Z");
  repository.get.mockResolvedValue(null);
  repository.listDue.mockResolvedValue([
    { settings, organizationId: "org", userEmail: "author@site.fr" },
  ]);
  repository.claim.mockResolvedValue(true);
  repository.finish.mockResolvedValue(undefined);
  vi.mocked(WorkbenchService.discoverProspects).mockResolvedValue({
    competitors: 1,
    observed: 10,
    added: 3,
    skipped: 0,
  });
  vi.mocked(ProjectContextRepository.listCompetitors).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
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
