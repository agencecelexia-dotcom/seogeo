import { AsyncLocalStorage } from "node:async_hooks";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { UsageBudgetService } from "./UsageBudgetService";
import { AppError } from "@/server/lib/errors";

export type BudgetCustomer = { organizationId: string; projectId?: string };
const customerScope = new AsyncLocalStorage<BudgetCustomer>();
export function withBudgetCustomer<T>(
  customer: BudgetCustomer,
  work: () => Promise<T>,
) {
  return customerScope.run(customer, work);
}
export const PRIVATE_BUDGET_MODEL = "openai/gpt-5.4-mini";
const costSchema = z.object({
  openrouter: z.object({
    usage: z.object({ cost: z.number().nonnegative().finite() }),
  }),
});
function reportedCost(value: unknown) {
  const parsed = costSchema.safeParse(value);
  return parsed.success ? parsed.data.openrouter.usage.cost : null;
}

// Only this text model has a bounded tariff here. UTF-8 byte count safely
// overestimates text tokens; reserve output + framing margin before each step.
export function budgetedModel(
  model: LanguageModelV3,
  modelId: string,
  resolveCustomer?: () => Promise<BudgetCustomer | null>,
): LanguageModelV3 {
  const capturedCustomer = customerScope.getStore();
  const prepare = async (
    params: Parameters<LanguageModelV3["doGenerate"]>[0],
  ) => {
    if (await isHostedServerAuthMode()) return { params, hold: null };
    const customer = resolveCustomer
      ? await resolveCustomer()
      : (capturedCustomer ?? customerScope.getStore());
    if (!customer || modelId !== PRIVATE_BUDGET_MODEL)
      throw new AppError(
        "VALIDATION_ERROR",
        `La génération privée exige un contexte de projet et le modèle ${PRIVATE_BUDGET_MODEL} pour borner son coût.`,
      );
    if (
      params.prompt.some(
        (message) =>
          Array.isArray(message.content) &&
          message.content.some((part) => part.type === "file"),
      )
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Le budget de génération couvre les entrées texte uniquement.",
      );
    const maxOutputTokens = Math.min(params.maxOutputTokens ?? 4096, 8192);
    const bytes = new TextEncoder().encode(JSON.stringify(params)).length;
    const estimatedUsd =
      ((bytes + 10_000) * 0.75) / 1_000_000 +
      (maxOutputTokens * 4.5) / 1_000_000;
    const { withPgClient } = await import("@/db");
    const hold = await withPgClient(() =>
      UsageBudgetService.reserve(customer, {
        category: "ai",
        provider: "openrouter",
        operation: "text_generation",
        estimatedUsd,
      }),
    );
    return { params: { ...params, maxOutputTokens }, hold };
  };
  const settle = async (
    hold: Awaited<ReturnType<typeof prepare>>["hold"],
    metadata: unknown,
  ) => {
    if (!hold) return;
    const { withPgClient } = await import("@/db");
    await withPgClient(() =>
      UsageBudgetService.settle(hold, reportedCost(metadata)),
    );
  };
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ params }) => {
        const prepared = await prepare(params);
        try {
          // Calling the underlying model is necessary to apply the output bound.
          const result = await model.doGenerate(prepared.params);
          await settle(prepared.hold, result.providerMetadata);
          return result;
        } catch (error) {
          await settle(prepared.hold, null);
          throw error;
        }
      },
      wrapStream: async ({ params }) => {
        const prepared = await prepare(params);
        try {
          const result = await model.doStream(prepared.params);
          let settled = false;
          return {
            ...result,
            stream: result.stream.pipeThrough(
              new TransformStream({
                async transform(part, controller) {
                  if (part.type === "finish") {
                    await settle(prepared.hold, part.providerMetadata);
                    settled = true;
                  }
                  controller.enqueue(part);
                },
                async flush() {
                  if (!settled) await settle(prepared.hold, null);
                },
              }),
            ),
          };
        } catch (error) {
          await settle(prepared.hold, null);
          throw error;
        }
      },
    },
  });
}
