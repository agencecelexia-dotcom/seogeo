import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  applyVercelEnvironmentDefaults,
  configurationResponse,
} from "./configuration";

beforeEach(() => {
  for (const key of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "CRON_SECRET",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("uses only platform-provided production origin and the PostgreSQL alias", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "platform.example");
  vi.stubEnv(
    "POSTGRES_URL",
    "postgresql://local-user:fixture-password@database.example/app",
  );
  applyVercelEnvironmentDefaults();
  expect(process.env.BETTER_AUTH_URL).toBe("https://platform.example");
  expect(process.env.DATABASE_URL).toBe(process.env.POSTGRES_URL);
  vi.stubEnv("BETTER_AUTH_URL", "https://explicit.example");
  vi.stubEnv("DATABASE_URL", "postgresql://explicit.example/app");
  applyVercelEnvironmentDefaults();
  expect(process.env.BETTER_AUTH_URL).toBe("https://explicit.example");
  expect(process.env.DATABASE_URL).toBe("postgresql://explicit.example/app");
});

it.each(["preview", "development"])(
  "does not send %s authentication to the production domain",
  (environment) => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "platform.example");
    applyVercelEnvironmentDefaults();
    expect(process.env.BETTER_AUTH_URL).toBeUndefined();
  },
);

it("rejects credentials or paths in a platform domain", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv(
    "VERCEL_PROJECT_PRODUCTION_URL",
    "user:password@platform.example/path",
  );
  applyVercelEnvironmentDefaults();
  expect(process.env.BETTER_AUTH_URL).toBeUndefined();
});

it("shows setup instructions without echoing configured secrets or request headers", async () => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture-user:never-render-this@database.example/app",
  );
  vi.stubEnv("BETTER_AUTH_SECRET", "another-secret-that-must-not-be-rendered");
  const response = configurationResponse(
    new Request("https://injected.example/", {
      headers: { accept: "text/html", "x-forwarded-host": "injected.example" },
    }),
  )!;
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  const html = await response.text();
  expect(html).toContain("Installation à terminer");
  expect(html).toContain("pnpm db:migrate:pg");
  expect(html).not.toContain("never-render-this");
  expect(html).not.toContain("another-secret-that-must-not-be-rendered");
  expect(html).not.toContain("injected.example");
});

it("keeps the JSON failure contract for API clients and lets configured requests continue", async () => {
  const request = new Request("https://app.example/api/cron", {
    headers: { accept: "text/html" },
  });
  const response = configurationResponse(request)!;
  expect(await response.json()).toEqual({
    error: "Configuration Vercel incomplète",
    missing: [
      "DATABASE_URL",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
    ],
  });
  for (const key of [
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "CRON_SECRET",
  ])
    vi.stubEnv(key, "configured-test-value");
  expect(configurationResponse(request)).toBeNull();
});
