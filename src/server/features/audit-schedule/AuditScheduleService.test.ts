import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditScheduleService } from "./AuditScheduleService";
import { AuditScheduleRepository } from "./AuditScheduleRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditService } from "@/server/features/audit/services/AuditService";

vi.mock("./AuditScheduleRepository", () => ({
  AuditScheduleRepository: { due: vi.fn(), claim: vi.fn(), finish: vi.fn() },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: { getLatestAuditForProject: vi.fn() },
}));
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: { startAudit: vi.fn(), resolveAuditLimitTier: vi.fn() },
}));

const now = new Date("2026-11-22T10:00:00Z");
const row = {
  schedule: {
    projectId: "p",
    authorizedByUserId: "u",
    enabled: true,
    maxPages: 1000,
    nextRunAt: "2026-11-21T10:00:00Z",
    lastRunAt: null,
    lastOutcome: null,
    updatedAt: "2026-11-21T10:00:00Z",
  },
  domain: "example.com",
  organizationId: "org",
  userEmail: "owner@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(AuditScheduleRepository.due).mockResolvedValue([row]);
  vi.mocked(AuditScheduleRepository.claim).mockResolvedValue(true);
  vi.mocked(AuditRepository.getLatestAuditForProject).mockResolvedValue(
    undefined,
  );
  vi.mocked(AuditService.resolveAuditLimitTier).mockResolvedValue(
    "self_hosted",
  );
  vi.mocked(AuditService.startAudit).mockResolvedValue({
    auditId: "00000000-0000-0000-0000-000000000001",
  });
});
describe("weekly HTML audits", () => {
  it("starts only a bounded native audit with the author and project context", async () => {
    await AuditScheduleService.runDue(now);
    expect(AuditService.startAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u",
        projectId: "p",
        startUrl: "https://example.com",
        maxPages: 1000,
        renderJavaScript: false,
        lighthouseStrategy: "none",
        billingCustomer: {
          organizationId: "org",
          projectId: "p",
          userId: "u",
          userEmail: "owner@example.com",
        },
      }),
    );
  });
  it("does not duplicate a run claimed by another scheduler", async () => {
    vi.mocked(AuditScheduleRepository.claim).mockResolvedValue(false);
    await AuditScheduleService.runDue(now);
    expect(AuditService.startAudit).not.toHaveBeenCalled();
  });
  it("records failure and backs off instead of looping", async () => {
    vi.mocked(AuditService.startAudit).mockRejectedValue(
      new Error("workflow unavailable"),
    );
    await AuditScheduleService.runDue(now);
    expect(AuditScheduleRepository.finish).toHaveBeenCalledWith(
      "p",
      now.toISOString(),
      expect.stringContaining("impossible"),
      "2026-11-22T11:00:00.000Z",
    );
  });
  it("keeps another project's schedule moving if one start fails", async () => {
    vi.mocked(AuditScheduleRepository.due).mockResolvedValue([
      row,
      { ...row, schedule: { ...row.schedule, projectId: "second" } },
    ]);
    vi.mocked(AuditService.startAudit)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({
        auditId: "00000000-0000-0000-0000-000000000002",
      });
    await AuditScheduleService.runDue(now);
    expect(AuditService.startAudit).toHaveBeenCalledTimes(2);
  });
});
