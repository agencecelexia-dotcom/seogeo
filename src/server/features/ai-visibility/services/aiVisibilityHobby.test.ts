import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { collectAiLiveBatch, prepareAiRun } from "./aiVisibilityCollection";

const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  fail: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/server/lib/dataforseo", () => ({
  MAX_TASKS_PER_POST: 100,
  createDataforseoClient: () => ({
    aiSearch: { trackingLiveBatch: mocks.live },
  }),
}));
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  resolveLatestLlmModelName: vi.fn(),
}));
vi.mock("../repositories/AiVisibilityRepository", () => ({
  AiVisibilityRepository: {
    getRunInternal: async () => ({
      projectId: "project",
      trigger: "manual",
      locationCode: 2840,
      languageCode: "en",
    }),
    updateActiveRun: async () => true,
    getObservations: async () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: `answer-${i}`,
        prompt: "Which SEO tools?",
        engine: "chatgpt",
        status: "pending",
      })),
    getProject: async () => ({
      id: "project",
      name: "OpenSEO",
      brandName: null,
      domain: "site.fr",
    }),
    listCompetitors: async () => [],
    failPendingObservations: mocks.fail,
  },
}));
beforeEach(() => {
  vi.stubEnv("RUNTIME_PLATFORM", "vercel");
  mocks.live.mockResolvedValue([
    {
      status: "fulfilled",
      value: {
        status: "failed",
        retryable: true,
        code: "UPSTREAM_UNAVAILABLE",
        message: "Provider unavailable",
      },
    },
  ]);
  mocks.fail.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("limits a Hobby paid checkpoint to one provider attempt and persists its failure", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const collecting = collectAiLiveBatch(
    "run",
    { organizationId: "org", userId: "user", userEmail: "user@example.com" },
    { locationCode: 2840, languageCode: "en" },
    [{ tag: "answer-0", prompt: "Which SEO tools?", engine: "chatgpt" }],
  );
  await vi.runAllTimersAsync();
  await collecting;
  expect(mocks.live).toHaveBeenCalledOnce();
  expect(mocks.fail).toHaveBeenCalledExactlyOnceWith(
    "run",
    "UPSTREAM_UNAVAILABLE",
    ["answer-0"],
  );
});
it("prepares bounded live batches of at most four answers on Hobby", async () => {
  const plan = await prepareAiRun("run");
  expect(plan.live).toBe(true);
  if (plan.live)
    expect(plan.batches.map((batch) => batch.length)).toEqual([4, 2]);
});
