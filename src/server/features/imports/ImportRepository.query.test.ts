import { readFileSync } from "node:fs";
import type { Client, InValue } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ImportService } from "./ImportService";
import type { ImportInput } from "@/shared/data-imports";

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
    build: (tx: LibSQLDatabase) => {
      toSQL: () => { sql: string; params: InValue[] };
    }[],
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
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    INSERT INTO projects VALUES ('site-a'), ('site-b'), ('site-c');
  `);
  const migration = readFileSync(
    new URL(
      "../../../../drizzle/sqlite/0074_youthful_meggan.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (
      /import_batches|imported_geo_metrics|imported_backlinks/.test(statement)
    )
      await client.execute(statement);
  }
});

afterAll(() => client.close());

function input(projectId: string, value = 12): ImportInput {
  return {
    projectId,
    source: "gsc_generative",
    fileName: "pages.csv",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-21",
    csv: `Pages,Impressions\nhttps://example.fr/services,${value}`,
  };
}

describe("import persistence", () => {
  it("scopes observations and fingerprint deduplication to the authorized project", async () => {
    await ImportService.commit(input("site-a"), "example.fr", "user-a");
    const other = await ImportService.preview(input("site-b"), "example.fr");
    expect(other.alreadyImported).toBe(false);
    expect(await ImportService.list("site-b")).toEqual({
      batches: [],
      geo: [],
      backlinks: [],
    });
  });

  it("replaces a revised observation without double counting the same dimensions", async () => {
    await ImportService.commit(input("site-b"), "example.fr", "user-b");
    await ImportService.commit(input("site-b", 20), "example.fr", "user-b");
    const { batches, geo } = await ImportService.list("site-b");
    expect(batches).toHaveLength(2);
    expect(geo).toHaveLength(1);
    expect(geo[0]).toMatchObject({
      value: 20,
      pageUrl: "https://example.fr/services",
    });
  });

  it("rolls back the batch and earlier rows when any row cannot be persisted", async () => {
    await client.execute(`
      CREATE TRIGGER reject_broken_import BEFORE INSERT ON imported_geo_metrics
      WHEN NEW.page_url = 'https://example.fr/broken'
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;
    `);
    await expect(
      ImportService.commit(
        {
          ...input("site-c"),
          csv: "Pages,Impressions\nhttps://example.fr/services,12\nhttps://example.fr/broken,4",
        },
        "example.fr",
        "user-c",
      ),
    ).rejects.toThrow();
    expect(await ImportService.list("site-c")).toEqual({
      batches: [],
      geo: [],
      backlinks: [],
    });
  });
});
