import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringRepository } from "./MonitoringRepository";
import { MonitoringService } from "./MonitoringService";
import { GscApiError } from "@/server/lib/gscErrors";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  gscConnection: vi.fn(),
  ga4Connection: vi.fn(),
  gsc: vi.fn(),
  ga4: vi.fn(),
  workflow: { get: vi.fn(), create: vi.fn() },
  repo: {
    getSettings: vi.fn(),
    sourceState: vi.fn(),
    purgeSource: vi.fn(),
    startRun: vi.fn<typeof MonitoringRepository.startRun>(),
    finishRun: vi.fn(),
    replaceDay: vi.fn<typeof MonitoringRepository.replaceDay>(),
    saveSourceState: vi.fn(),
    nextRun: vi.fn(),
    initializeProjects: vi.fn(),
    listDue: vi.fn(),
  },
}));
vi.mock("./MonitoringRepository", () => ({ MonitoringRepository: mocks.repo }));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: mocks.project },
}));
vi.mock(
  "@/server/features/dashboard/repositories/DataRefreshClaimRepository",
  () => ({
    DataRefreshClaimRepository: { claim: mocks.claim, finish: mocks.release },
  }),
);
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: mocks.gscConnection },
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.ga4Connection },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.gsc },
}));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: { runReport: mocks.ga4 },
}));
vi.mock("@/server/vercel/workflows", () => ({
  createWorkflowBinding: () => mocks.workflow,
}));

const now = new Date("2026-11-22T12:00:00.000Z");
const sync = () => MonitoringService.syncProject("site-1", "org-1", now);
beforeEach(() => {
  vi.stubEnv("RUNTIME_PLATFORM", "");
  mocks.workflow.get.mockRejectedValue(
    new Error("Workflow instance not found"),
  );
  mocks.workflow.create.mockResolvedValue({});
  mocks.project.mockResolvedValue({ id: "site-1" });
  mocks.claim.mockResolvedValue("claim");
  mocks.release.mockResolvedValue(undefined);
  mocks.gscConnection.mockResolvedValue(null);
  mocks.ga4Connection.mockResolvedValue(null);
  mocks.repo.getSettings.mockResolvedValue({
    enabled: true,
    backfillDays: 480,
  });
  mocks.repo.sourceState.mockResolvedValue(null);
  mocks.repo.replaceDay.mockResolvedValue(undefined);
  mocks.repo.saveSourceState.mockResolvedValue(undefined);
  mocks.repo.listDue.mockResolvedValue([
    { projectId: "site-1", organizationId: "org-1" },
  ]);
  mocks.gsc.mockResolvedValue({ rows: [] });
  mocks.ga4.mockResolvedValue({
    rows: [],
    pageInfo: { hasMore: false },
    reportMetadata: { hasLimitedData: false },
    request: { currencyCode: "EUR" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Vercel daily monitoring", () => {
  it("dispatches a durable daily cycle without collecting Google reports in the cron", async () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    await MonitoringService.runScheduled(now);
    expect(mocks.workflow.create).toHaveBeenCalledWith({
      id: "site-1:2026-11-22",
      params: { projectId: "site-1", organizationId: "org-1" },
    });
    expect(mocks.repo.nextRun).toHaveBeenCalledWith(
      "site-1",
      "2026-11-23T00:00:00.000Z",
    );
    expect(mocks.gsc).not.toHaveBeenCalled();
    expect(mocks.ga4).not.toHaveBeenCalled();
  });

  it("keeps an existing daily job even when it has already completed", async () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    mocks.workflow.get.mockResolvedValue({ id: "site-1:2026-11-22" });
    await MonitoringService.runScheduled(now);
    expect(mocks.workflow.create).not.toHaveBeenCalled();
    expect(mocks.repo.nextRun).toHaveBeenCalled();
  });

  it("leaves the project due when persisting its workflow fails", async () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    mocks.workflow.create.mockRejectedValue(new Error("database unavailable"));
    await MonitoringService.runScheduled(now);
    expect(mocks.repo.nextRun).not.toHaveBeenCalled();
  });
});

describe("resumable Google synchronization", () => {
  it("records unconnected sources without inventing zero traffic", async () => {
    expect(await sync()).toEqual({ status: "unavailable" });
    expect(mocks.repo.startRun.mock.calls.map(([run]) => run)).toMatchObject([
      { source: "gsc", status: "unconnected", sourceProperty: null },
      { source: "ga4", status: "unconnected", sourceProperty: null },
    ]);
    expect(mocks.repo.replaceDay).not.toHaveBeenCalled();
    expect(mocks.gsc).not.toHaveBeenCalled();
    expect(mocks.ga4).not.toHaveBeenCalled();
  });

  it("keeps property totals and page rows separate and reports truncated coverage", async () => {
    mocks.gscConnection.mockResolvedValue({
      id: "gsc-connection",
      siteUrl: "sc-domain:example.fr",
    });
    const page = {
      keys: ["https://example.fr/"],
      clicks: 2,
      impressions: 10,
      position: 3,
    };
    mocks.gsc
      .mockResolvedValueOnce({
        rows: [{ clicks: 40, impressions: 100, position: 2 }],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 1001 }, (_, index) => ({
          ...page,
          keys: [`https://example.fr/${index}`],
        })),
      });
    expect(await sync()).toEqual({ status: "synced" });
    const stored = mocks.repo.replaceDay.mock.calls[0][4].rows;
    expect(stored).toHaveLength(1001);
    expect(stored[0]).toMatchObject({
      grain: "site",
      page: "",
      clicks: 40,
      sourceTimeZone: "America/Los_Angeles",
      date: "2026-11-13",
    });
    expect(stored[1]).toMatchObject({
      grain: "page",
      page: "https://example.fr/0",
      clicks: 2,
    });
    expect(mocks.repo.finishRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        coverage: "partial_row_limit",
        rowCount: 1001,
      }),
    );
  });

  it("resumes backfill at the prior cursor after recent days are complete", async () => {
    mocks.gscConnection.mockResolvedValue({
      id: "gsc-connection",
      siteUrl: "sc-domain:example.fr",
    });
    mocks.repo.sourceState.mockImplementation(async (_project, source) =>
      source === "gsc"
        ? {
            sourceProperty: "sc-domain:example.fr",
            refreshCycleDate: "2026-11-22",
            refreshedThrough: "2026-11-19",
            backfillBefore: "2026-11-13",
          }
        : null,
    );
    await sync();
    expect(mocks.gsc).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-11-12",
        endDate: "2026-11-12",
        dataState: "final",
      }),
    );
    expect(mocks.repo.saveSourceState).toHaveBeenCalledWith(
      expect.objectContaining({
        backfillBefore: "2026-11-12",
        refreshedThrough: "2026-11-19",
      }),
      "gsc-connection",
    );
  });

  it("stores GA4 source currency and timezone while preserving missing key events", async () => {
    mocks.ga4Connection.mockResolvedValue({
      id: "ga4-connection",
      propertyId: "properties/123",
      propertyTimeZone: "Europe/Paris",
    });
    mocks.ga4.mockResolvedValue({
      rows: [
        {
          hostName: "example.fr",
          landingPage: "/services",
          sessions: 12,
          purchaseRevenue: 15,
        },
      ],
      pageInfo: { hasMore: false },
      reportMetadata: { hasLimitedData: true },
      request: { currencyCode: "EUR" },
    });
    await sync();
    expect(mocks.repo.replaceDay.mock.calls[0][4].rows).toEqual([
      expect.objectContaining({
        page: "https://example.fr/services",
        grain: "landing",
        sessions: 12,
        keyEvents: null,
        revenue: 15,
        currencyCode: "EUR",
        sourceTimeZone: "Europe/Paris",
        date: "2026-11-15",
      }),
    ]);
    expect(mocks.repo.finishRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ coverage: "google_limited" }),
    );
  });

  it("keeps the cursor on a quota failure so a later run can retry the same day", async () => {
    mocks.gscConnection.mockResolvedValue({
      id: "gsc-connection",
      siteUrl: "sc-domain:example.fr",
    });
    mocks.gsc.mockRejectedValue(new GscApiError(429, "quota"));
    expect(await sync()).toEqual({ status: "unavailable" });
    expect(mocks.repo.finishRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "error",
        errorCode: "quota_exhausted",
      }),
    );
    expect(mocks.repo.saveSourceState).not.toHaveBeenCalled();
    expect(mocks.repo.replaceDay).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("monitoring:site-1", "claim", 0);
  });

  it("does not collect a project from another organization", async () => {
    mocks.project.mockResolvedValue(null);
    await expect(sync()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.gsc).not.toHaveBeenCalled();
  });
});
