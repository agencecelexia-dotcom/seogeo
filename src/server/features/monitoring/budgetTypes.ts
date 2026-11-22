import { z } from "zod";
export type BudgetCategory = "data" | "ai";
export const usageBudgetInput = z.object({
  dataLimitEur: z.number().min(0).max(500),
  aiLimitEur: z.number().min(0).max(100),
  usdToEur: z.number().min(0.1).max(5),
  suspended: z.boolean().default(false),
});
export type UsageBudgetInput = z.infer<typeof usageBudgetInput>;
export function budgetMonth(now = new Date()): string {
  // Billing periods use a documented, fixed UTC boundary.
  return now.toISOString().slice(0, 7);
}
