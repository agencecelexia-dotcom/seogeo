import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseProvider, getPostgresConnectionString } from "./provider";

const bindings = vi.hoisted(() => ({
  RUNTIME_PLATFORM: undefined as string | undefined,
  DATABASE_PROVIDER: undefined as string | undefined,
  HYPERDRIVE: undefined as { connectionString: string } | undefined,
}));
vi.mock("cloudflare:workers", () => ({ env: bindings }));
beforeEach(() => {
  bindings.RUNTIME_PLATFORM = undefined;
  bindings.DATABASE_PROVIDER = undefined;
  bindings.HYPERDRIVE = undefined;
  vi.stubEnv("RUNTIME_PLATFORM", "");
  vi.stubEnv("DATABASE_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("database runtime selection", () => {
  it("requires PostgreSQL on Vercel and accepts its pooled integration URL", () => {
    bindings.RUNTIME_PLATFORM = "vercel";
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@db-pooler.test/app");
    expect(getDatabaseProvider()).toBe("postgres");
    expect(getPostgresConnectionString()).toBe(
      "postgresql://user:password@db-pooler.test/app",
    );
    bindings.DATABASE_PROVIDER = "d1";
    expect(getDatabaseProvider).toThrow("requires DATABASE_PROVIDER=postgres");
  });

  it("rejects invalid Vercel configuration without exposing credentials", () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    vi.stubEnv("DATABASE_URL", "https://user:secret@invalid.test");
    expect(getPostgresConnectionString).toThrow(
      "The Vercel runtime requires a PostgreSQL DATABASE_URL from its database integration.",
    );
  });

  it("preserves local D1 and Workers Hyperdrive routing", () => {
    expect(getDatabaseProvider()).toBe("d1");
    vi.stubEnv("DATABASE_URL", "postgres://unrelated.test/app");
    bindings.DATABASE_PROVIDER = "postgres";
    expect(getPostgresConnectionString).toThrow(
      "requires a HYPERDRIVE binding",
    );
    bindings.HYPERDRIVE = {
      connectionString: "postgres://hyperdrive.test/app",
    };
    expect(getPostgresConnectionString()).toBe(
      "postgres://hyperdrive.test/app",
    );
  });
});
