import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WeeklyReviewService } from "./WeeklyReviewService";
import { WeeklyReviewRepository } from "./WeeklyReviewRepository";

vi.mock("./WeeklyReviewRepository", () => ({
  WeeklyReviewRepository: { evidence: vi.fn() },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-11-22T12:00:00.000Z");
  vi.mocked(WeeklyReviewRepository.evidence).mockResolvedValue({
    completedAudits: [],
    events: [],
    imports: [],
    runs: [],
    coverage: [],
    priorities: [],
  });
});
afterEach(() => vi.useRealTimers());
it("uses the authorized organization and an explicit seven-day observation period", async () => {
  const review = await WeeklyReviewService.generate("my-org");
  expect(WeeklyReviewRepository.evidence).toHaveBeenCalledWith(
    "my-org",
    "2026-11-15T12:00:00.000Z",
    "2026-11-22T12:00:00.000Z",
  );
  expect(review).toMatchObject({
    activity: [],
    periodStart: "2026-11-15T12:00:00.000Z",
    periodEnd: "2026-11-22T12:00:00.000Z",
    limited: false,
  });
  expect(review.interpretation).toContain(
    "ne calcule aucune variation de trafic",
  );
});
it("keeps an import's data period distinct from its collection timestamp", async () => {
  vi.mocked(WeeklyReviewRepository.evidence).mockResolvedValue({
    completedAudits: [],
    events: [],
    runs: [],
    coverage: [],
    priorities: [],
    imports: [
      {
        id: "import",
        projectId: "site",
        projectName: "Mon site",
        source: "bing_ai",
        status: "complete",
        rowCount: 8,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        createdAt: "2026-11-20T12:00:00.000Z",
      },
    ],
  });
  const review = await WeeklyReviewService.generate("my-org");
  expect(review.activity[0]).toMatchObject({
    occurredAt: "2026-11-20T12:00:00.000Z",
  });
  expect(review.activity[0].detail).toContain("2026-10-01 au 2026-10-31");
});
