import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["private-workbench.spec.ts", "parasite-seo.spec.ts"],
  outputDir: "../test-results/private",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3104",
    channel: "chrome",
    ...(process.env.PRIVATE_E2E_EMAIL
      ? { extraHTTPHeaders: { "x-vercel-forwarded-for": "127.0.0.1" } }
      : {}),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
