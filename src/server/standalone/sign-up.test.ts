import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertStandaloneSignUpOpen,
  isStandaloneSignUpOpen,
} from "@/server/standalone/sign-up";
import { env } from "cloudflare:workers";

const mocks = vi.hoisted(() => ({
  hasAnyUser: vi.fn(),
  hasPendingInvitationForEmail: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: mocks,
}));
afterEach(() => vi.unstubAllEnvs());

describe("isStandaloneSignUpOpen", () => {
  beforeEach(() => {
    mocks.hasAnyUser.mockResolvedValue(true);
    mocks.hasPendingInvitationForEmail.mockResolvedValue(false);
    Reflect.deleteProperty(env, "OPENSEO_OPERATOR_SECRET");
  });

  it("lets the first account through on a fresh installation", async () => {
    mocks.hasAnyUser.mockResolvedValue(false);

    await expect(isStandaloneSignUpOpen("stranger@example.com")).resolves.toBe(
      true,
    );
  });

  it("closes once an account exists", async () => {
    await expect(isStandaloneSignUpOpen("stranger@example.com")).resolves.toBe(
      false,
    );
  });

  it("keeps the first public Vercel visitor from claiming the installation", async () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    mocks.hasAnyUser.mockResolvedValue(false);
    await expect(isStandaloneSignUpOpen("stranger@example.com")).resolves.toBe(
      false,
    );
  });

  it("allows secret-authenticated operator bootstrap on Vercel", async () => {
    vi.stubEnv("RUNTIME_PLATFORM", "vercel");
    const secret = "test-operator-secret-with-at-least-32-characters";
    Reflect.set(env, "OPENSEO_OPERATOR_SECRET", secret);
    await expect(
      assertStandaloneSignUpOpen(
        new Headers({ "x-openseo-operator-secret": secret }),
        { email: "admin@example.com" },
      ),
    ).resolves.toBeUndefined();
  });

  it("stays open for an address with a pending invitation", async () => {
    mocks.hasPendingInvitationForEmail.mockResolvedValue(true);

    await expect(isStandaloneSignUpOpen("invitee@example.com")).resolves.toBe(
      true,
    );
    expect(mocks.hasPendingInvitationForEmail).toHaveBeenCalledWith(
      "invitee@example.com",
    );
  });
});
