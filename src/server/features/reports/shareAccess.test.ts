import { afterEach, describe, expect, it, vi } from "vitest";
import { sharesEnabled } from "./shareAccess";

vi.mock("cloudflare:workers", () => ({ env: {} }));
afterEach(() => vi.unstubAllEnvs());

describe("private report and embed access", () => {
  it.each(["password", "cloudflare_access", "local_noauth", "everyapp", ""])(
    "does not expose bearer links in %s mode",
    async (mode) => {
      vi.stubEnv("AUTH_MODE", mode);
      expect(await sharesEnabled()).toBe(false);
    },
  );
  it("retains upstream sharing only for the hosted product", async () => {
    vi.stubEnv("AUTH_MODE", "hosted");
    expect(await sharesEnabled()).toBe(true);
  });
});
