import type { Client } from "@libsql/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { UsageBudgetService } from "./UsageBudgetService";
import { UsageBudgetRepository } from "./UsageBudgetRepository";
import { budgetMonth } from "./budgetTypes";

const runtime = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  runtime.client = createClient({ url: "file::memory:" });
  return { db: drizzle(runtime.client) };
});
vi.mock("@/db/runBatch", async () => {
  const { db } = await import("@/db");
  return {
    runBatch: async (
      build: (tx: typeof db) => Parameters<typeof db.batch>[0],
    ) => db.batch(build(db)),
  };
});

beforeAll(async () => {
  await runtime.client?.executeMultiple(`
    CREATE TABLE usage_budget_settings (organization_id TEXT PRIMARY KEY, data_limit_micros INTEGER NOT NULL DEFAULT 15000000, ai_limit_micros INTEGER NOT NULL DEFAULT 5000000, usd_to_eur REAL NOT NULL DEFAULT 1, suspended INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE usage_budget_periods (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, category TEXT NOT NULL, month TEXT NOT NULL, limit_micros INTEGER NOT NULL, committed_micros INTEGER NOT NULL DEFAULT 0, UNIQUE(organization_id, category, month));
    CREATE TABLE usage_reservations (id TEXT PRIMARY KEY, period_id TEXT NOT NULL, organization_id TEXT NOT NULL, project_id TEXT, provider TEXT NOT NULL, operation TEXT NOT NULL, status TEXT NOT NULL, estimated_usd REAL NOT NULL, actual_usd REAL, reserved_micros INTEGER NOT NULL, usd_to_eur REAL NOT NULL, created_at TEXT NOT NULL, settled_at TEXT);
  `);
});
beforeEach(async () => {
  await runtime.client?.executeMultiple(
    "DELETE FROM usage_reservations; DELETE FROM usage_budget_periods; DELETE FROM usage_budget_settings;",
  );
});
afterAll(() => runtime.client?.close());

const customer = { organizationId: "org-1", projectId: "site-1" };
const reserve = (estimatedUsd: number) =>
  UsageBudgetService.reserve(customer, {
    category: "data",
    provider: "dataforseo",
    operation: "test",
    estimatedUsd,
  });
const overview = () =>
  UsageBudgetRepository.overview(customer.organizationId, budgetMonth());

describe("persistent private usage budget", () => {
  it("counts concurrent in-flight calls against the shared monthly ceiling", async () => {
    const results = await Promise.allSettled([
      reserve(6),
      reserve(6),
      reserve(6),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(2);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "INSUFFICIENT_CREDITS" } });
    const ledger = await overview();
    expect(ledger.config).toMatchObject({
      dataLimitMicros: 15_000_000,
      aiLimitMicros: 5_000_000,
    });
    expect(ledger.periods[0].committedMicros).toBe(12_000_000);
    expect(ledger.reservations).toHaveLength(2);
  });

  it("settles actual USD once using the reservation's conversion rate", async () => {
    await UsageBudgetRepository.saveSettings(customer.organizationId, {
      dataLimitMicros: 15_000_000,
      aiLimitMicros: 5_000_000,
      usdToEur: 0.9,
      suspended: false,
    });
    const hold = await reserve(6);
    await UsageBudgetRepository.saveSettings(customer.organizationId, {
      dataLimitMicros: 15_000_000,
      aiLimitMicros: 5_000_000,
      usdToEur: 1.1,
      suspended: false,
    });
    await Promise.all([
      UsageBudgetService.settle(hold, 4),
      UsageBudgetService.settle(hold, 4),
    ]);
    const ledger = await overview();
    expect(ledger.periods[0].committedMicros).toBe(3_600_000);
    expect(ledger.reservations[0]).toMatchObject({
      status: "settled",
      actualUsd: 4,
      usdToEur: 0.9,
    });
  });

  it("keeps an uncertain transport outcome reserved and refuses replay past the limit", async () => {
    const hold = await reserve(10);
    await UsageBudgetService.settle(hold, null);
    await expect(reserve(6)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect((await overview()).reservations[0]).toMatchObject({
      status: "uncertain",
      actualUsd: null,
      reservedMicros: 10_000_000,
    });
  });

  it("suspends new spend if a provider exceeds its advertised maximum", async () => {
    const hold = await reserve(1);
    await UsageBudgetService.settle(hold, 2);
    await expect(reserve(0.01)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    const ledger = await overview();
    expect(ledger.config.suspended).toBe(true);
    expect(ledger.periods[0].committedMicros).toBe(2_000_000);
  });

  it("cannot release another organization's reservation", async () => {
    const hold = await reserve(6);
    await UsageBudgetService.settle({ ...hold, organizationId: "org-2" }, 0);
    expect((await overview()).periods[0].committedMicros).toBe(6_000_000);
  });

  it("applies a lowered limit even while earlier calls remain in flight", async () => {
    await reserve(6);
    await UsageBudgetRepository.saveSettings(customer.organizationId, {
      dataLimitMicros: 5_000_000,
      aiLimitMicros: 5_000_000,
      usdToEur: 1,
      suspended: false,
    });
    await expect(reserve(0.01)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect((await overview()).periods[0].committedMicros).toBe(6_000_000);
  });
});
