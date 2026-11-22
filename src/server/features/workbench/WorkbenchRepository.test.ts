import { readFileSync, rmSync } from "node:fs";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { WorkbenchRepository as repository } from "./WorkbenchRepository";
import { WorkbenchDiscoveryRepository as discovery } from "./WorkbenchDiscoveryRepository";
import type { runBatch } from "@/db/runBatch";

const database = vi.hoisted(() => ({
  client: null as Client | null,
  db: null as LibSQLDatabase | null,
  directory: "",
}));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  database.directory = mkdtempSync(`${tmpdir()}/workbench-sql-`);
  database.client = createClient({ url: `file:${database.directory}/test.db` });
  database.db = drizzle(database.client);
  return { db: database.db };
});
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: Parameters<typeof runBatch>[0]) => {
    if (!database.db) throw new Error("Test database unavailable");
    await database.db.transaction(async (transaction) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the real libsql transaction exposes the same query surface as D1.
      const tx = transaction as unknown as Parameters<typeof build>[0];
      for (const statement of build(tx)) await statement;
    });
  },
}));

beforeAll(async () => {
  const ddl =
    readFileSync("drizzle/sqlite/0074_youthful_meggan.sql", "utf8") +
    "\n--> statement-breakpoint\n" +
    readFileSync("drizzle/sqlite/0075_clever_prowler.sql", "utf8");
  await database.client!.executeMultiple(`
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text, archived_at text);
    CREATE TABLE user (id text PRIMARY KEY, email text);
    CREATE TABLE member (organization_id text, user_id text);
    INSERT INTO projects VALUES ('project', 'org', NULL), ('other', 'other-org', NULL);
    INSERT INTO user VALUES ('user', 'author@site.fr');
    ${ddl
      .split("--> statement-breakpoint")
      .filter((statement) =>
        /(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX).*`(?:workbench_|backlink_prospects)/s.test(
          statement,
        ),
      )
      .join("\n")}
  `);
});
afterAll(() => {
  database.client?.close();
  rmSync(database.directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await database.client!.executeMultiple(
    "DELETE FROM workbench_events; DELETE FROM backlink_prospects; DELETE FROM workbench_actions; DELETE FROM workbench_discovery_settings; DELETE FROM member;",
  );
});

async function seedAction() {
  await repository.insertAction(
    {
      id: "action",
      projectId: "project",
      title: "Add title",
      pageUrl: "https://site.fr/",
      evidenceText: "Missing title",
      recommendation: "Add a relevant title",
      source: "manual",
      sourceKey: "action",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "created",
      projectId: "project",
      actionId: "action",
      toStatus: "todo",
      note: "Created",
      createdAt: "2026-01-01",
    },
  );
  return (await repository.getAction("project", "action"))!;
}
it("scopes reads to the authorized project", async () => {
  await seedAction();
  expect(await repository.getAction("other", "action")).toBeNull();
  expect(await repository.listActions("other")).toEqual([]);
});
it("atomically records the first change and rejects a stale competing change", async () => {
  const action = await seedAction();
  const event = {
    projectId: "project",
    actionId: "action",
    toStatus: "done",
    note: "Done",
    createdAt: "2026-01-02",
  };
  expect(
    await repository.changeAction(
      action,
      { status: "done" },
      { ...event, id: "done" },
    ),
  ).toBe(true);
  expect(
    await repository.changeAction(
      action,
      { status: "dismissed" },
      { ...event, id: "stale", toStatus: "dismissed" },
    ),
  ).toBe(false);
  expect(await repository.getAction("project", "action")).toMatchObject({
    revision: 1,
    status: "done",
  });
  expect(
    (await repository.listEvents("project", { actionId: "action" })).map(
      (entry) => entry.id,
    ),
  ).toEqual(["done", "created"]);
});
it("only schedules discoveries while the author remains an organization member", async () => {
  await discovery.save({
    projectId: "project",
    authorizedByUserId: "user",
    enabled: true,
    targetUrl: "https://site.fr/",
    nextRunAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  expect(await discovery.listDue("2026-01-02")).toEqual([]);
  await database.client!.execute("INSERT INTO member VALUES ('org', 'user')");
  expect(await discovery.listDue("2026-01-02")).toHaveLength(1);
  expect(
    await discovery.claim("project", "2026-01-01", "2026-02-02", "2026-01-02"),
  ).toBe(true);
  expect(
    await discovery.claim("project", "2026-01-01", "2026-02-02", "2026-01-02"),
  ).toBe(false);
});
it("deduplicates a concurrent prospect discovery without creating an orphan history event", async () => {
  const row = {
    projectId: "project",
    sourceUrl: "https://source.fr/article",
    targetUrl: "https://site.fr/",
    reason: "Citation",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  await repository.insertProspect(
    { ...row, id: "first" },
    {
      id: "first-event",
      projectId: "project",
      prospectId: "first",
      toStatus: "discovered",
      note: "Created",
      createdAt: "2026-01-01",
    },
  );
  await repository.insertProspect(
    { ...row, id: "second" },
    {
      id: "second-event",
      projectId: "project",
      prospectId: "second",
      toStatus: "discovered",
      note: "Created",
      createdAt: "2026-01-01",
    },
  );
  expect(await repository.listProspects("project")).toHaveLength(1);
  expect(
    await repository.listEvents("project", { prospectId: "second" }),
  ).toEqual([]);
  expect(
    await repository.findProspect("project", row.sourceUrl, row.targetUrl),
  ).toMatchObject({ id: "first" });
});
it("revalidates queued discovery authorization and its exact monthly slot before claiming", async () => {
  await discovery.save({
    projectId: "project",
    authorizedByUserId: "user",
    enabled: true,
    targetUrl: "https://site.fr/",
    nextRunAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  await database.client!.execute("INSERT INTO member VALUES ('org', 'user')");
  expect(await discovery.findDueProject("project", "2026-01-01")).toMatchObject(
    { organizationId: "org" },
  );
  expect(await discovery.findDueProject("project", "2025-12-01")).toBeNull();
  await database.client!.execute("DELETE FROM member");
  expect(await discovery.findDueProject("project", "2026-01-01")).toBeNull();
  expect(
    await discovery.claim("project", "2026-01-01", "2026-02-01", "2026-01-01"),
  ).toBe(false);
});
