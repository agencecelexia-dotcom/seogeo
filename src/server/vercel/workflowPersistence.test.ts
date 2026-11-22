import { readFileSync, readdirSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { WorkflowStore } from "./workflowStore";
import { PostgresAuditScratchpad } from "./auditScratchpad";
import { executeWorkflowSlice } from "./workflowEngine";
import { createWorkflowBinding } from "./workflows";

const database = vi.hoisted(() => ({ client: null as PGlite | null }));
vi.mock("@/db", () => ({
  withPgClient: async (run: () => Promise<unknown>) => run(),
}));
vi.mock("@/db/pg/client", async () => {
  const { PGlite: Client } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  database.client = new Client();
  const testDb = drizzle(database.client);
  // Both execute real Postgres SQL. Normalize PGlite's {rows} result to the
  // postgres-js RowList used by the application; no query builders are mocked.
  const wrap = (client: Pick<typeof testDb, "execute">) => ({
    execute: async (query: SQL) => (await client.execute(query)).rows,
  });
  return {
    pgDb: {
      ...wrap(testDb),
      transaction: (run: (tx: ReturnType<typeof wrap>) => Promise<unknown>) =>
        testDb.transaction((tx) => run(wrap(tx))),
    },
  };
});
beforeAll(async () => {
  const ddl = readdirSync("drizzle/pg")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    // oxlint-disable-next-line unicorn/no-array-sort -- this fresh array is local; TypeScript targets ES2022.
    .sort()
    .map((name) => readFileSync(`drizzle/pg/${name}`, "utf8"))
    .join("--> statement-breakpoint");
  await database.client!.exec(
    `CREATE TABLE projects(id text PRIMARY KEY); INSERT INTO projects VALUES ('project'); CREATE TABLE audits(id text PRIMARY KEY); ${ddl
      .split("--> statement-breakpoint")
      .filter((statement) =>
        /(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE).*"vercel_(?:workflow_|audit_)/s.test(
          statement,
        ),
      )
      .join("\n")}`,
  );
});
afterAll(async () => {
  await database.client?.close();
});
beforeEach(async () => {
  await database.client!.exec(
    "TRUNCATE vercel_workflow_jobs,audits CASCADE; INSERT INTO audits VALUES ('audit'),('other');",
  );
});
it("removes crawl state with its audit and rejects a late callback after erasure", async () => {
  const pad = new PostgresAuditScratchpad("audit");
  await pad.seedStart("https://site.fr/private-path");
  await database.client!.exec("DELETE FROM audits WHERE id='audit'");
  await pad.destroyForErasure();
  await expect(pad.seedStart("https://site.fr/late-path")).rejects.toThrow();
  expect(
    (await database.client!.query("SELECT * FROM vercel_audit_frontier")).rows,
  ).toEqual([]);
  expect(
    (await database.client!.query("SELECT * FROM vercel_audit_scratchpads"))
      .rows,
  ).toEqual([]);
});
it("preserves the binding output contract and creates a fresh checkpoint generation on explicit restart", async () => {
  const binding = createWorkflowBinding("ai-visibility");
  const handle = await binding.create({
    id: "setup",
    params: { setupProjectId: "project" },
  });
  const claimed = (await WorkflowStore.claimJob(
    new Date().toISOString(),
    "2099-01-01T00:00:00.000Z",
  ))!;
  await WorkflowStore.finishJob(claimed, {
    state: "complete",
    nextRunAt: new Date().toISOString(),
    outputText: JSON.stringify({ value: { review: "ready" } }),
  });
  expect(await handle.status()).toMatchObject({
    status: "complete",
    output: { review: "ready" },
  });
  await handle.restart();
  expect(await WorkflowStore.getJob("ai-visibility:setup")).toMatchObject({
    state: "queued",
    generation: 1,
    outputText: null,
  });
});
it("grants only one durable lease under concurrent cron claims and fences cancelled writes", async () => {
  await WorkflowStore.createJob({
    jobKey: "rank-check:run",
    kind: "rank-check",
    instanceId: "run",
    projectId: "project",
    payloadText: "{}",
  });
  const stamp = new Date().toISOString();
  const claims = await Promise.all([
    WorkflowStore.claimJob(stamp, "2099-01-01T00:00:00.000Z"),
    WorkflowStore.claimJob(stamp, "2099-01-01T00:00:00.000Z"),
  ]);
  const claimed = claims.find((row) => row !== null)!;
  expect(claims.filter(Boolean)).toHaveLength(1);
  await WorkflowStore.controlJob(claimed.jobKey, "terminate");
  expect(
    await WorkflowStore.saveStep(claimed, {
      name: "late",
      state: "complete",
      attempts: 1,
      nextRunAt: null,
      resultText: "{}",
      errorText: null,
    }),
  ).toBe(false);
  await expect(
    WorkflowStore.controlJob(claimed.jobKey, "restart"),
  ).rejects.toThrow("may still be active");
});
it("recovers an expired SQL lease while refusing an uncertain paid checkpoint", async () => {
  await WorkflowStore.createJob({
    jobKey: "ai-visibility:crash",
    kind: "ai-visibility",
    instanceId: "crash",
    projectId: "project",
    payloadText: "{}",
  });
  const stamp = new Date().toISOString();
  const first = (await WorkflowStore.claimJob(stamp, stamp))!;
  await WorkflowStore.saveStep(first, {
    name: "paid",
    state: "running",
    attempts: 1,
    nextRunAt: null,
    resultText: null,
    errorText: null,
  });
  const resumed = (await WorkflowStore.claimJob(
    stamp,
    "2099-01-01T00:00:00.000Z",
  ))!;
  expect(await WorkflowStore.ownsLease(first)).toBe(false);
  const call = vi.fn(async () => "duplicate charge");
  const result = await executeWorkflowSlice(resumed, WorkflowStore, (step) =>
    step.do("paid", { retries: { limit: 0, delay: "1 second" } }, call),
  );
  expect(result.state).toBe("errored");
  expect(call).not.toHaveBeenCalled();
  expect((await WorkflowStore.getStep(resumed, "paid"))?.state).toBe("errored");
});
it("resumes the same crawl leases after a new instance and never claims another chunk under the same number", async () => {
  const first = new PostgresAuditScratchpad("audit");
  await first.seedStart("https://site.fr/");
  await first.seedSitemapUrls(["https://site.fr/a", "https://site.fr/b"]);
  const claimed = await first.claimChunk(1, 2, 3);
  expect(claimed.isRetry).toBe(false);
  const resumed = new PostgresAuditScratchpad("audit");
  expect(await resumed.claimChunk(1, 2, 3)).toEqual({
    urls: claimed.urls,
    isRetry: true,
  });
  await resumed.recordBatch({
    crawledUrls: claimed.urls.map((row) => row.url),
    pages: [],
    links: [],
    discovered: [],
  });
  expect(await resumed.claimChunk(1, 2, 3)).toEqual({
    urls: [],
    isRetry: true,
  });
  expect(await resumed.getStats()).toEqual({
    attempted: 2,
    pending: 1,
    seen: 3,
  });
  expect(await new PostgresAuditScratchpad("other").getStats()).toEqual({
    attempted: 0,
    pending: 0,
    seen: 0,
  });
});
it("reports only observed broken targets and suppresses orphans on incomplete crawls", async () => {
  const pad = new PostgresAuditScratchpad("audit");
  await pad.recordBatch({
    crawledUrls: [],
    discovered: [],
    pages: [
      {
        pageId: "home",
        url: "https://site.fr/",
        statusCode: 200,
        fetchClass: "ok",
        redirectUrl: null,
      },
      {
        pageId: "missing",
        url: "https://site.fr/missing",
        statusCode: 404,
        fetchClass: "ok",
        redirectUrl: null,
      },
      {
        pageId: "blocked",
        url: "https://site.fr/blocked",
        statusCode: 403,
        fetchClass: "blocked",
        redirectUrl: null,
      },
      {
        pageId: "orphan",
        url: "https://site.fr/orphan",
        statusCode: 200,
        fetchClass: "ok",
        redirectUrl: null,
      },
    ],
    links: [
      {
        pageId: "home",
        url: "https://site.fr/",
        targets: [
          "https://site.fr/missing",
          "https://site.fr/blocked",
          "https://site.fr/unseen",
        ],
      },
    ],
  });
  const result = await pad.runFinalizeChecks({
    startUrl: "https://site.fr/",
    crawlCompleted: false,
  });
  expect(result.brokenLinks.map((row) => row.targetUrl)).toEqual([
    "https://site.fr/missing",
  ]);
  expect(result.orphanPages).toEqual([]);
  expect(
    (
      await pad.runFinalizeChecks({
        startUrl: "https://site.fr/",
        crawlCompleted: true,
      })
    ).orphanPages,
  ).toEqual([{ pageId: "orphan", url: "https://site.fr/orphan" }]);
  await pad.destroy();
  expect(await new PostgresAuditScratchpad("audit").getStats()).toEqual({
    attempted: 0,
    pending: 0,
    seen: 0,
  });
});
