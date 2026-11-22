import type { BillingCustomerContext } from "@/server/billing/subscription";
import { UsageBudgetService } from "@/server/features/monitoring/UsageBudgetService";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "./envelope";

/** Private calls reserve their ceiling before the provider can charge them. */
export async function withPrivateDataforseoBudget<T>(
  customer: BillingCustomerContext,
  operation: string,
  estimatedUsd: number,
  execute: () => Promise<DataforseoApiResponse<T>>,
): Promise<DataforseoApiResponse<T>> {
  if (await isHostedServerAuthMode()) return execute();
  // Resellers and gateway tariffs are not necessarily the raw DataForSEO
  // cost returned in the envelope, so this private ledger requires a direct key.
  if (
    (await getOptionalEnvValue("AUTH_MODE")) === "everyapp" ||
    !(await getOptionalEnvValue("DATAFORSEO_API_KEY"))
  ) {
    throw new AppError(
      "DATAFORSEO_AUTH_FAILED",
      "Le budget privé exige une clé DataForSEO directe. Les tarifs de revente ou de passerelle ne sont pas pris en charge.",
    );
  }
  const hold = await UsageBudgetService.reserve(customer, {
    category: "data",
    provider: "dataforseo",
    operation,
    estimatedUsd,
  });
  let actualUsd: number | null = null;
  try {
    const result = await execute();
    actualUsd = result.billing.costUsd;
    return result;
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError)
      actualUsd = error.billing.costUsd;
    throw error;
  } finally {
    // Lost responses can still be charged. Keep that ceiling committed.
    await UsageBudgetService.settle(hold, actualUsd);
  }
}
