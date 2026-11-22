import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ExternalPublicationService as service } from "./ExternalPublicationService";
import type { SaveExternalPublicationInput } from "@/types/schemas/external-publications";

const database = vi.hoisted(() => ({ client: null as PGlite | null }));
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "postgres" },
}));
vi.mock("@/db", async () => {
  const { PGlite: Database } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  database.client = new Database();
  return { db: drizzle(database.client) };
});
const client = database.client;
if (!client) throw new Error("Test database missing");
beforeAll(async () => {
  await client.exec("CREATE TABLE projects (id text PRIMARY KEY)");
  await client.exec(
    readFileSync("drizzle/pg/0057_external_publications.sql", "utf8"),
  );
});
beforeEach(async () => {
  await client.exec(
    "DELETE FROM external_publications; INSERT INTO projects VALUES ('project'), ('other') ON CONFLICT DO NOTHING;",
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
afterAll(() => client.close());
const publication = (
  overrides: Partial<SaveExternalPublicationInput> = {},
): SaveExternalPublicationInput => ({
  projectId: "project",
  strategyId: "guest_article",
  platformName: "Journal professionnel",
  targetKeyword: "ressource métier",
  targetUrl: "https://site.fr/ressource",
  title: "Guide métier pour les lecteurs",
  ...overrides,
});

describe("external publication service with real PostgreSQL", () => {
  it("scopes lists and updates to the authorized project", async () => {
    const saved = await service.save(publication());
    expect(await service.list("other")).toEqual({
      publications: [],
      truncated: false,
    });
    await expect(
      service.save({ ...saved, projectId: "other", title: "Wrong project" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await service.list("project")).publications).toEqual([saved]);
  });

  it("accepts only one competing update for a revision", async () => {
    const saved = await service.save(publication());
    const results = await Promise.allSettled([
      service.save({ ...saved, title: "First writer" }),
      service.save({ ...saved, title: "Second writer" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "CONFLICT" } });
    const [current] = (await service.list("project")).publications;
    expect(current.revision).toBe(1);
    expect(["First writer", "Second writer"]).toContain(current.title);
  });

  it("requires a published URL before accepting the published status", async () => {
    await expect(
      service.save(publication({ status: "published" })),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["publishedUrl"] })],
    });
    expect((await service.list("project")).publications).toEqual([]);
  });

  it("refuses unsafe link schemes without fetching external content", async () => {
    await expect(
      service.save(publication({ supportUrl: "javascript:alert(1)" })),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["supportUrl"] })],
    });
    expect((await service.list("project")).publications).toEqual([]);
  });

  it("records the first declaration of publication and preserves it when archived", async () => {
    const idea = await service.save(publication());
    expect(idea.publishedAt).toBeNull();
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const published = await service.save({
      ...idea,
      status: "published",
      publishedUrl: "https://journal.fr/guide",
      linkPolicy: "nofollow",
    });
    expect(published.publishedAt).toBe("2026-11-23T12:00:00.000Z");
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
    const archived = await service.save({ ...published, status: "archived" });
    expect(archived).toMatchObject({
      publishedAt: published.publishedAt,
      publishedUrl: "https://journal.fr/guide",
      linkPolicy: "nofollow",
      revision: 2,
    });
  });

  it("returns at most 200 records and explicitly signals truncation", async () => {
    await Promise.all(
      Array.from({ length: 201 }, (_, index) =>
        service.save(publication({ title: `Guide ${index}` })),
      ),
    );
    const result = await service.list("project");
    expect(result.publications).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });

  it("removes publications when their project is deleted", async () => {
    await service.save(publication());
    await client.exec("DELETE FROM projects WHERE id='project'");
    expect((await service.list("project")).publications).toEqual([]);
  });
});
