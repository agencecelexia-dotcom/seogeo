import { readFileSync } from "node:fs";
import type { Client, InValue } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MonitoringRepository } from "./MonitoringRepository";

const database = vi.hoisted(() => ({
  client: null as Client | null,
  db: null as LibSQLDatabase | null,
}));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  database.client = createClient({ url: "file::memory:" });
  database.db = drizzle(database.client);
  return { db: database.db };
});
vi.mock("@/db/runBatch", () => ({
  runBatch: async (
    build: (
      tx: LibSQLDatabase,
    ) => { toSQL: () => { sql: string; params: InValue[] } }[],
  ) => {
    if (!database.db || !database.client) throw new Error("Missing test DB");
    await database.client.batch(
      build(database.db).map((query) => {
        const { sql, params } = query.toSQL();
        return { sql, args: params };
      }),
      "write",
    );
  },
}));
const client = database.client;
if (!client) throw new Error("Missing test DB");

beforeAll(async () => {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT, archived_at TEXT);
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    INSERT INTO organization VALUES ('org');
    INSERT INTO projects VALUES ('site-gsc', 'org', NULL), ('site-ga4', 'org', NULL);
    CREATE TABLE gsc_connections (id TEXT PRIMARY KEY, project_id TEXT, site_url TEXT);
    CREATE TABLE ga4_connections (id TEXT PRIMARY KEY, project_id TEXT, property_id TEXT);
  `);
  for (const file of ["0074_youthful_meggan.sql", "0075_clever_prowler.sql"]) {
    const migration = readFileSync(
      new URL(`../../../../drizzle/sqlite/${file}`, import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      if (
        /monitoring_daily_metrics|monitoring_source_states|monitoring_runs/.test(
          statement,
        )
      )
        await client.execute(statement);
  }
});
afterAll(() => client.close());

describe.each(["gsc", "ga4"] as const)(
  "%s disconnect persistence",
  (source) => {
    it("blocks an in-flight sync after disconnect, including after reconnecting the same property", async () => {
      const projectId = `site-${source}`;
      const table = source === "gsc" ? "gsc_connections" : "ga4_connections";
      const connectionId = `old-${source}`;
      await client.execute({
        sql: `INSERT INTO ${table} VALUES (?, ?, ?)`,
        args: [connectionId, projectId, "property"],
      });
      const state = {
        id: projectId,
        projectId,
        source,
        sourceProperty: "property",
        updatedAt: "2026-11-01",
      };
      const row = {
        id: `metric-${source}`,
        projectId,
        source,
        sourceProperty: "property",
        sourceTimeZone: "UTC",
        grain: "page",
        date: "2026-11-01",
        page: "https://example.fr/",
        impressions: 12,
        fetchedAt: "2026-11-01",
      };
      await MonitoringRepository.replaceDay(
        projectId,
        source,
        "property",
        row.date,
        { rows: [row], connectionId },
      );
      await MonitoringRepository.saveSourceState(state, connectionId);
      await MonitoringRepository.purgeSource(projectId, source, true);
      await MonitoringRepository.replaceDay(
        projectId,
        source,
        "property",
        row.date,
        { rows: [row], connectionId },
      );
      await MonitoringRepository.saveSourceState(state, connectionId);
      expect(
        await MonitoringRepository.sourceState(projectId, source),
      ).toBeNull();
      expect(
        (
          await client.execute({
            sql: "SELECT id FROM monitoring_daily_metrics WHERE project_id = ?",
            args: [projectId],
          })
        ).rows,
      ).toEqual([]);

      const newId = `new-${source}`;
      await client.execute({
        sql: `INSERT INTO ${table} VALUES (?, ?, ?)`,
        args: [newId, projectId, "property"],
      });
      await MonitoringRepository.replaceDay(
        projectId,
        source,
        "property",
        row.date,
        { rows: [{ ...row, impressions: 20 }], connectionId: newId },
      );
      await MonitoringRepository.replaceDay(
        projectId,
        source,
        "property",
        row.date,
        { rows: [row], connectionId },
      );
      expect(
        (
          await client.execute({
            sql: "SELECT impressions FROM monitoring_daily_metrics WHERE project_id = ?",
            args: [projectId],
          })
        ).rows,
      ).toEqual([{ impressions: 20 }]);
    });
  },
);
