import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { handleCronRequest } from "./cron";

const state = vi.hoisted(() => ({
  database: null as PGlite | null,
  run: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("./workers", () => ({ env: {} }));
vi.mock("./workflows", () => ({ runDueWorkflows: state.run }));
vi.mock("@/db/pg/client", async () => {
  const { PGlite: Client } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  state.database = new Client();
  return { pgDb: drizzle(state.database) };
});
beforeAll(async () => {
  await state.database!.exec(`CREATE TABLE runtime_kv_entries (
    namespace text NOT NULL, key text NOT NULL, value text NOT NULL,
    metadata text, expires_at text, updated_at text NOT NULL,
    PRIMARY KEY(namespace,key))`);
});
beforeEach(async () => {
  vi.stubEnv(
    "CRON_SECRET",
    "local-cron-test-secret-with-at-least-32-characters",
  );
  await state.database!.exec("TRUNCATE runtime_kv_entries");
  state.run.mockResolvedValue({ processed: 0 });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await state.database?.close();
});
const request = () =>
  new Request("https://app.example/api/cron/workflows", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

it("refuses missing credentials and non-GET requests before running jobs", async () => {
  expect(
    (await handleCronRequest(new Request(request().url), "workflows")).status,
  ).toBe(401);
  expect(
    (
      await handleCronRequest(
        new Request(request(), { method: "POST" }),
        "workflows",
      )
    ).status,
  ).toBe(401);
  expect(state.run).not.toHaveBeenCalled();
});
it("leases overlapping cron invocations once and releases after completion", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.run.mockReturnValue(blocked);
  const first = handleCronRequest(request(), "workflows");
  await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  expect(
    await (await handleCronRequest(request(), "workflows")).json(),
  ).toEqual({ status: "already-running" });
  release();
  expect((await first).status).toBe(200);
  expect((await handleCronRequest(request(), "workflows")).status).toBe(200);
  expect(state.run).toHaveBeenCalledTimes(2);
});
it("releases a failed invocation so its durable jobs can be resumed", async () => {
  state.run.mockRejectedValueOnce(new Error("database interrupted"));
  await expect(handleCronRequest(request(), "workflows")).rejects.toThrow(
    "database interrupted",
  );
  expect((await handleCronRequest(request(), "workflows")).status).toBe(200);
});
