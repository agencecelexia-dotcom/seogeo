import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  getOpenRouterAccessSetupStatus,
  getSamAccessSetupStatus,
} from "./samAccess";

const bindings = vi.hoisted(() => ({
  RUNTIME_PLATFORM: "vercel",
  AUTH_MODE: "password",
  OPENROUTER_API_KEY: undefined as string | undefined,
}));
vi.mock("cloudflare:workers", () => ({ env: bindings }));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler:
          (handler: () => unknown) =>
          ({ data }: { data: unknown }) => {
            schema.parse(data);
            return handler();
          },
      }),
    }),
  }),
}));
beforeEach(() => {
  bindings.RUNTIME_PLATFORM = "vercel";
  bindings.AUTH_MODE = "password";
  bindings.OPENROUTER_API_KEY = undefined;
  for (const key of [
    "RUNTIME_PLATFORM",
    "AUTH_MODE",
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());
const request = { data: { projectId: "authorized-project" } };

it.each([undefined, "test-openrouter-key"])(
  "checks OpenRouter configuration on Vercel independently of disabled SAM (key: %s)",
  async (key) => {
    bindings.OPENROUTER_API_KEY = key;
    const research = await getOpenRouterAccessSetupStatus(request);
    expect(research.enabled).toBe(Boolean(key));
    if (key) expect(research.errorMessage).toBeNull();
    else
      expect(research.errorMessage).toContain("OPENROUTER_API_KEY is not set");
    const sam = await getSamAccessSetupStatus(request);
    expect(sam.enabled).toBe(false);
    expect(sam.errorMessage).toContain("SAM intégré n’est pas disponible");
  },
);

it("preserves key-based SAM access on other private runtimes", async () => {
  bindings.RUNTIME_PLATFORM = "cloudflare";
  bindings.OPENROUTER_API_KEY = "test-openrouter-key";
  expect(await getSamAccessSetupStatus(request)).toEqual({
    enabled: true,
    errorMessage: null,
  });
});
