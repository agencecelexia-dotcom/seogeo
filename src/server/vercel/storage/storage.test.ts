import type { PGlite } from "@electric-sql/pglite";
import type { drizzle } from "drizzle-orm/pglite";
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
import { createPostgresKv } from "./kv";
import { createVercelBlobBucket } from "./blob";
import { pruneVercelStorage } from "./maintenance";
import { createPostgresAuthRateLimitStorage } from "./auth-rate-limit";
// Initialize the real SQL fixture through the same imported handle as the repository.
import { db } from "@/db";
import {
  runtimeKvEntries,
  runtimeBlobObjects,
  runtimeBlobDeletions,
} from "@/db/schema";

const runtime = vi.hoisted(() => ({
  client: null as PGlite | null,
  database: null as ReturnType<typeof drizzle> | null,
  payloads: new Map<string, Uint8Array>(),
  remove: vi.fn<(urls: string[]) => Promise<void>>(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "postgres" },
}));
vi.mock("@/db", async () => {
  const { PGlite: Database } = await import("@electric-sql/pglite");
  const { drizzle: makeDrizzle } = await import("drizzle-orm/pglite");
  runtime.client = new Database();
  runtime.database = makeDrizzle(runtime.client);
  return {
    db: runtime.database,
    withPgClient: <T>(work: () => Promise<T>) => work(),
  };
});
vi.mock("@/db/runBatch", () => ({
  runBatch: async (
    build: (
      tx: Parameters<
        Parameters<ReturnType<typeof drizzle>["transaction"]>[0]
      >[0],
    ) => readonly Promise<unknown>[],
  ) => {
    if (!runtime.database) throw new Error("Test database missing");
    await runtime.database.transaction(async (tx) => {
      for (const query of build(tx)) await query;
    });
  },
}));
vi.mock("@vercel/blob", () => ({
  put: async (
    pathname: string,
    body: Uint8Array,
    options: { access: string },
  ) => {
    if (options.access !== "private")
      throw new Error("Public write refused by fixture");
    const url = `https://test.private.blob.vercel-storage.com/${pathname}`;
    runtime.payloads.set(url, body);
    return { url, etag: pathname, pathname };
  },
  get: async (url: string, options: { access: string; useCache: boolean }) => {
    if (options.access !== "private" || options.useCache)
      throw new Error("Expected authenticated consistent read");
    const body = runtime.payloads.get(url);
    return body
      ? { statusCode: 200, stream: new Response(Uint8Array.from(body)).body }
      : null;
  },
  del: runtime.remove,
}));
const client = runtime.client;
if (!client) throw new Error("Test database missing");
beforeAll(async () => {
  await client.exec(`
    CREATE TABLE runtime_kv_entries (namespace text NOT NULL, key text NOT NULL, value text NOT NULL, metadata text, expires_at text, updated_at text NOT NULL, PRIMARY KEY(namespace,key));
    CREATE TABLE runtime_blob_objects (key text PRIMARY KEY, blob_url text NOT NULL, size integer NOT NULL, etag text NOT NULL, http_metadata text NOT NULL, custom_metadata text NOT NULL, uploaded_at text NOT NULL, expires_at text);
    CREATE TABLE runtime_blob_deletions (blob_url text PRIMARY KEY, queued_at text NOT NULL);
  `);
});
beforeEach(async () => {
  await db.delete(runtimeKvEntries);
  await db.delete(runtimeBlobObjects);
  await db.delete(runtimeBlobDeletions);
  runtime.payloads.clear();
  runtime.remove.mockImplementation(async (urls) => {
    for (const url of urls) runtime.payloads.delete(url);
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
afterAll(() => client.close());

describe("Vercel storage with real Postgres SQL", () => {
  it("shares an atomic authentication limit across instances and expires it", async () => {
    const firstInstance = createPostgresAuthRateLimitStorage();
    const secondInstance = createPostgresAuthRateLimitStorage();
    const rule = { window: 60, max: 3 };
    const cache = createPostgresKv();
    await cache.put("sign-in:client", "unrelated");
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 ? firstInstance : secondInstance).consume(
          "sign-in:client",
          rule,
        ),
      ),
    );
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(3);
    expect(attempts.filter((attempt) => !attempt.allowed)).toEqual(
      Array.from({ length: 7 }, () => ({ allowed: false, retryAfter: 60 })),
    );
    expect(await firstInstance.get("sign-in:client")).toEqual(
      await secondInstance.get("sign-in:client"),
    );
    expect(await cache.get("sign-in:client")).toBe("unrelated");
    vi.setSystemTime(new Date("2026-11-22T12:01:01Z"));
    expect(await secondInstance.get("sign-in:client")).toBeNull();
    expect(await secondInstance.consume("sign-in:client", rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it("renews the authentication window only after accepted requests", async () => {
    const limiter = createPostgresAuthRateLimitStorage();
    const rule = { window: 60, max: 2 };
    await limiter.consume("sign-in:client", rule);
    vi.setSystemTime(new Date("2026-11-22T12:00:30Z"));
    await limiter.consume("sign-in:client", rule);
    vi.setSystemTime(new Date("2026-11-22T12:01:10Z"));
    expect(await limiter.consume("sign-in:client", rule)).toEqual({
      allowed: false,
      retryAfter: 20,
    });
    vi.setSystemTime(new Date("2026-11-22T12:01:31Z"));
    expect(await limiter.consume("sign-in:client", rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it("isolates OAuth keys and expires values before returning them", async () => {
    const cache = createPostgresKv();
    const oauth = createPostgresKv("oauth");
    await cache.put("same-key", JSON.stringify({ attempts: 1 }), {
      expirationTtl: 60,
      metadata: { source: "cache" },
    });
    await oauth.put("same-key", "grant");
    expect(await cache.getWithMetadata("same-key", "json")).toMatchObject({
      value: { attempts: 1 },
      metadata: { source: "cache" },
    });
    vi.setSystemTime(new Date("2026-11-22T12:01:01Z"));
    expect(await cache.get("same-key")).toBeNull();
    expect(await oauth.get("same-key")).toBe("grant");
    expect(await pruneVercelStorage()).toEqual({
      kvDeleted: 1,
      blobsDeleted: 0,
    });
  });

  it("lists literal prefixes with stable pagination and no wildcard leakage", async () => {
    const kv = createPostgresKv();
    await kv.put("a%_/1", "one");
    await kv.put("a%_/2", "two");
    await kv.put("another/3", "excluded");
    const first = await kv.list({ prefix: "a%_", limit: 1 });
    expect(first.keys.map((row) => row.name)).toEqual(["a%_/1"]);
    const second = await kv.list({
      prefix: "a%_",
      limit: 1,
      cursor: first.cursor,
    });
    expect(second.keys.map((row) => row.name)).toEqual(["a%_/2"]);
    expect(second.list_complete).toBe(true);
    await expect(
      createPostgresKv("oauth").list({ prefix: "a%_", cursor: first.cursor }),
    ).rejects.toThrow("different list");
  });

  it("round-trips binary payloads without treating them as UTF-8", async () => {
    const kv = createPostgresKv();
    await kv.put("binary", new Uint8Array([0, 255, 42]));
    const result = await kv.get("binary", "arrayBuffer");
    expect(result && new Uint8Array(result)).toEqual(
      new Uint8Array([0, 255, 42]),
    );
  });

  it("keeps concurrent replacements paired with their own metadata", async () => {
    const bucket = createVercelBlobBucket();
    await Promise.all([
      bucket.put("audit/page", "first", {
        customMetadata: { version: "first" },
      }),
      bucket.put("audit/page", "second", {
        customMetadata: { version: "second" },
      }),
    ]);
    const result = await bucket.get("audit/page");
    expect(await result?.text()).toBe(result?.customMetadata.version);
    expect(runtime.payloads.size).toBe(2);
    expect(await pruneVercelStorage()).toEqual({
      kvDeleted: 0,
      blobsDeleted: 1,
    });
    expect(runtime.payloads.size).toBe(1);
    expect(await (await bucket.get("audit/page"))?.text()).toBe(
      result?.customMetadata.version,
    );
  });

  it("retains failed physical deletions for the next scheduled attempt", async () => {
    const bucket = createVercelBlobBucket();
    await bucket.put("export/private", "private result");
    await bucket.delete("export/private");
    expect(await bucket.get("export/private")).toBeNull();
    runtime.remove.mockRejectedValueOnce(new Error("Blob unavailable"));
    await expect(pruneVercelStorage()).rejects.toThrow("Blob unavailable");
    expect(runtime.payloads.size).toBe(1);
    expect(await pruneVercelStorage()).toEqual({
      kvDeleted: 0,
      blobsDeleted: 1,
    });
    expect(runtime.payloads.size).toBe(0);
  });

  it("expires cached files while preserving unexpired private artifacts", async () => {
    const bucket = createVercelBlobBucket();
    await bucket.put("cache/old", "old", {
      customMetadata: { expiresAt: "2026-11-21T12:00:00Z" },
    });
    await bucket.put("audit/live", "live", {
      httpMetadata: { contentType: "application/json" },
    });
    await pruneVercelStorage();
    expect(await bucket.get("cache/old")).toBeNull();
    const current = await bucket.get("audit/live");
    const headers = new Headers();
    current?.writeHttpMetadata(headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(await current?.text()).toBe("live");
  });
});
