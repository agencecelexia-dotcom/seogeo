import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3 } from "@openrouter/ai-sdk-provider";
import {
  budgetedModel,
  PRIVATE_BUDGET_MODEL,
  withBudgetCustomer,
} from "./budgetedModel";
import type { UsageBudgetService } from "./UsageBudgetService";
import { AppError } from "@/server/lib/errors";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn<typeof UsageBudgetService.reserve>(),
  settle: vi.fn<typeof UsageBudgetService.settle>(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("@/db", () => ({
  withPgClient: <T>(work: () => Promise<T>) => work(),
}));
vi.mock("./UsageBudgetService", () => ({ UsageBudgetService: mocks }));
const customer = { organizationId: "org", projectId: "site" };
const hold = { id: "reservation", organizationId: "org" };
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const generate = vi.fn<LanguageModelV3["doGenerate"]>();
const stream = vi.fn<LanguageModelV3["doStream"]>();
const provider: LanguageModelV3 = {
  specificationVersion: "v3",
  provider: "openrouter",
  modelId: PRIVATE_BUDGET_MODEL,
  supportedUrls: {},
  doGenerate: generate,
  doStream: stream,
};
const params = {
  prompt: [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "Évalue cette page." }],
    },
  ],
  maxOutputTokens: 50000,
};
const model = () =>
  withBudgetCustomer(customer, async () =>
    budgetedModel(provider, PRIVATE_BUDGET_MODEL),
  );

beforeEach(() => {
  mocks.reserve.mockResolvedValue(hold);
  mocks.settle.mockResolvedValue(undefined);
  generate.mockResolvedValue({
    content: [{ type: "text", text: "ok" }],
    warnings: [],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
  });
  stream.mockResolvedValue({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
        });
        controller.close();
      },
    }),
  });
});

describe("private AI model budget", () => {
  it("reserves before generation, caps output and settles reported cost", async () => {
    const result = await (await model()).doGenerate(params);
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192 }),
    );
    expect(mocks.reserve).toHaveBeenCalledWith(
      customer,
      expect.objectContaining({
        category: "ai",
        provider: "openrouter",
      }),
    );
    expect(mocks.reserve.mock.calls[0][1].estimatedUsd).toBeGreaterThan(
      (8192 * 4.5) / 1_000_000,
    );
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0],
    );
    expect(mocks.settle).toHaveBeenCalledWith(hold, 0.001);
  });

  it("makes no provider request when another in-flight task exhausted the budget", async () => {
    mocks.reserve.mockRejectedValue(new AppError("INSUFFICIENT_CREDITS"));
    await expect((await model()).doGenerate(params)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses models with unknown tariffs before generating", async () => {
    const unsupported = await withBudgetCustomer(customer, async () =>
      budgetedModel(provider, "unverified-model"),
    );
    await expect(unsupported.doGenerate(params)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("retains the ceiling for an ambiguous provider failure", async () => {
    generate.mockRejectedValue(new Error("response lost"));
    await expect((await model()).doGenerate(params)).rejects.toThrow(
      "response lost",
    );
    expect(mocks.settle).toHaveBeenCalledWith(hold, null);
  });

  it("settles streamed answers only when their final usage arrives", async () => {
    const result = await (await model()).doStream(params);
    expect(mocks.settle).not.toHaveBeenCalled();
    const reader = result.stream.getReader();
    while (!(await reader.read()).done) {
      /* consume provider finish */
    }
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(hold, 0.002);
  });
});
