import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  usageBudgetSettings,
  usageBudgetPeriods,
  usageReservations,
} from "@/db/schema";
import type { BudgetCategory } from "./budgetTypes";

async function settings(organizationId: string) {
  await db
    .insert(usageBudgetSettings)
    .values({ organizationId, updatedAt: new Date().toISOString() })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(usageBudgetSettings)
    .where(eq(usageBudgetSettings.organizationId, organizationId));
  if (!row) throw new Error("Budget settings unavailable");
  return row;
}

async function saveSettings(
  organizationId: string,
  input: {
    dataLimitMicros: number;
    aiLimitMicros: number;
    usdToEur: number;
    suspended: boolean;
  },
) {
  return db
    .insert(usageBudgetSettings)
    .values({ organizationId, ...input, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: usageBudgetSettings.organizationId,
      set: { ...input, updatedAt: new Date().toISOString() },
    });
}

async function reserve(input: {
  organizationId: string;
  projectId?: string;
  category: BudgetCategory;
  month: string;
  provider: string;
  operation: string;
  estimatedUsd: number;
}) {
  const config = await settings(input.organizationId);
  if (config.suspended) return null;
  const limitMicros =
    input.category === "data" ? config.dataLimitMicros : config.aiLimitMicros;
  const reservedMicros = Math.ceil(
    input.estimatedUsd * config.usdToEur * 1_000_000,
  );
  const periodId = `${input.organizationId}:${input.category}:${input.month}`;
  await db
    .insert(usageBudgetPeriods)
    .values({
      id: periodId,
      organizationId: input.organizationId,
      category: input.category,
      month: input.month,
      limitMicros,
    })
    .onConflictDoUpdate({
      target: usageBudgetPeriods.id,
      set: { limitMicros },
    });
  // The conditional UPDATE is the serialization point on both databases. It
  // includes every already admitted call, not merely completed charges.
  const limitColumn =
    input.category === "data"
      ? usageBudgetSettings.dataLimitMicros
      : usageBudgetSettings.aiLimitMicros;
  const currentLimit = sql`(select ${limitColumn} from ${usageBudgetSettings} where ${usageBudgetSettings.organizationId} = ${input.organizationId})`;
  const activeConfig = sql`exists (select 1 from ${usageBudgetSettings} where ${eq(usageBudgetSettings.organizationId, input.organizationId)} and ${eq(usageBudgetSettings.suspended, false)} and ${eq(usageBudgetSettings.usdToEur, config.usdToEur)})`;
  const [admitted] = await db
    .update(usageBudgetPeriods)
    .set({
      committedMicros: sql`${usageBudgetPeriods.committedMicros} + ${reservedMicros}`,
      limitMicros: currentLimit,
    })
    .where(
      and(
        eq(usageBudgetPeriods.id, periodId),
        activeConfig,
        sql`${usageBudgetPeriods.committedMicros} + ${reservedMicros} <= ${currentLimit}`,
      ),
    )
    .returning({ id: usageBudgetPeriods.id });
  if (!admitted) return null;
  const id = crypto.randomUUID();
  // A storage failure after admission intentionally leaves the ceiling held:
  // failing closed is preferable to spending against an unrecorded allowance.
  const [hold] = await db
    .insert(usageReservations)
    .values({
      id,
      periodId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      provider: input.provider,
      operation: input.operation,
      status: "reserved",
      estimatedUsd: input.estimatedUsd,
      reservedMicros,
      usdToEur: config.usdToEur,
      createdAt: new Date().toISOString(),
    })
    .returning();
  return hold;
}

async function settle(
  id: string,
  organizationId: string,
  actualUsd: number | null,
) {
  // CAS prevents two retries from releasing the same reservation twice.
  // Interrupted/uncertain settlement keeps the original ceiling held.
  const [hold] = await db
    .update(usageReservations)
    .set({ status: "settling", actualUsd })
    .where(
      and(
        eq(usageReservations.id, id),
        eq(usageReservations.organizationId, organizationId),
        eq(usageReservations.status, "reserved"),
      ),
    )
    .returning();
  if (!hold) return;
  const actualMicros =
    actualUsd === null
      ? hold.reservedMicros
      : Math.ceil(actualUsd * hold.usdToEur * 1_000_000);
  // Counter reconciliation and the terminal state commit together. A crash
  // after the CAS but before this batch retains the original ceiling.
  await runBatch((tx) => [
    ...(actualMicros > hold.reservedMicros
      ? [
          tx
            .update(usageBudgetSettings)
            .set({ suspended: true, updatedAt: new Date().toISOString() })
            .where(eq(usageBudgetSettings.organizationId, organizationId)),
        ]
      : []),
    tx
      .update(usageBudgetPeriods)
      .set({
        committedMicros: sql`${usageBudgetPeriods.committedMicros} + ${actualMicros - hold.reservedMicros}`,
      })
      .where(eq(usageBudgetPeriods.id, hold.periodId)),
    tx
      .update(usageReservations)
      .set({
        status: actualUsd === null ? "uncertain" : "settled",
        settledAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(usageReservations.id, id),
          eq(usageReservations.organizationId, organizationId),
          eq(usageReservations.status, "settling"),
        ),
      ),
  ]);
}

async function overview(organizationId: string, month: string) {
  const [config, periods, reservations] = await Promise.all([
    settings(organizationId),
    db
      .select()
      .from(usageBudgetPeriods)
      .where(
        and(
          eq(usageBudgetPeriods.organizationId, organizationId),
          eq(usageBudgetPeriods.month, month),
        ),
      ),
    db
      .select()
      .from(usageReservations)
      .where(eq(usageReservations.organizationId, organizationId))
      .orderBy(desc(usageReservations.createdAt))
      .limit(100),
  ]);
  return { config, periods, reservations };
}

export const UsageBudgetRepository = {
  settings,
  saveSettings,
  reserve,
  settle,
  overview,
};
