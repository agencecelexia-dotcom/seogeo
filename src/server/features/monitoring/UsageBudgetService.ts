import {
  budgetMonth,
  type BudgetCategory,
  type UsageBudgetInput,
} from "./budgetTypes";
import { AppError } from "@/server/lib/errors";

type BudgetContext = { organizationId: string; projectId?: string };
async function reserve(
  context: BudgetContext,
  input: {
    category: BudgetCategory;
    provider: string;
    operation: string;
    estimatedUsd: number;
  },
) {
  if (!Number.isFinite(input.estimatedUsd) || input.estimatedUsd < 0)
    throw new AppError(
      "VALIDATION_ERROR",
      "Un coût maximal vérifiable est requis.",
    );
  const { UsageBudgetRepository } = await import("./UsageBudgetRepository");
  const hold = await UsageBudgetRepository.reserve({
    ...context,
    ...input,
    month: budgetMonth(),
  });
  if (!hold)
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "Collecte suspendue : plafond mensuel atteint ou budget désactivé.",
    );
  return { id: hold.id, organizationId: context.organizationId };
}
async function settle(
  hold: { id: string; organizationId: string },
  actualUsd: number | null,
) {
  const knownCost =
    actualUsd !== null && Number.isFinite(actualUsd) && actualUsd >= 0
      ? actualUsd
      : null;
  try {
    const { UsageBudgetRepository } = await import("./UsageBudgetRepository");
    await UsageBudgetRepository.settle(hold.id, hold.organizationId, knownCost);
  } catch (error) {
    // Keep the reservation conservative; never hide a paid result and tempt
    // a caller to replay its provider request just to repair accounting.
    console.error("Budget settlement incomplete; ceiling retained", {
      reservationId: hold.id,
      error,
    });
  }
}
async function overview(organizationId: string) {
  const { UsageBudgetRepository } = await import("./UsageBudgetRepository");
  return UsageBudgetRepository.overview(organizationId, budgetMonth());
}
async function updateSettings(organizationId: string, input: UsageBudgetInput) {
  const { UsageBudgetRepository } = await import("./UsageBudgetRepository");
  await UsageBudgetRepository.saveSettings(organizationId, {
    dataLimitMicros: Math.round(input.dataLimitEur * 1_000_000),
    aiLimitMicros: Math.round(input.aiLimitEur * 1_000_000),
    usdToEur: input.usdToEur,
    suspended: input.suspended,
  });
}
export const UsageBudgetService = { reserve, settle, overview, updateSettings };
