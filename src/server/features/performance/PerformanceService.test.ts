import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceService } from "./PerformanceService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue: vi.fn() }));
const request = vi.fn<typeof fetch>();
function requestUrl(input: Parameters<typeof fetch>[0] | undefined) {
  return input instanceof Request ? input.url : (input?.toString() ?? "");
}
const input = {
  url: "https://example.fr/services",
  strategy: "mobile" as const,
};
const lab = {
  lighthouseResult: {
    categories: { performance: { score: 0.9 } },
    audits: { "cumulative-layout-shift": { numericValue: 0 } },
  },
};

beforeEach(() => {
  vi.mocked(getOptionalEnvValue).mockResolvedValue(undefined);
  request.mockImplementation(async () => Response.json(lab));
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

describe("page performance", () => {
  it("keeps unconfigured field data unknown and a measured zero as zero", async () => {
    const result = await PerformanceService.inspect(input, "example.fr");
    expect(result.lab).toMatchObject({
      status: "available",
      performance: 90,
      cls: 0,
      lcp: null,
    });
    expect(result.field).toMatchObject({
      status: "not_configured",
      lcp: null,
      cls: null,
    });
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(requestUrl(request.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.searchParams.get("strategy")).toBe("mobile");
  });

  it("queries the selected page and device, preserving field units and collection period", async () => {
    vi.mocked(getOptionalEnvValue).mockImplementation(async (name) =>
      name === "GOOGLE_CRUX_API_KEY" ? "private-test-key" : undefined,
    );
    request.mockImplementation(async (url) =>
      requestUrl(url).includes("chromeuxreport")
        ? Response.json({
            record: {
              key: { url: input.url, formFactor: "PHONE" },
              collectionPeriod: {
                firstDate: { year: 2026, month: 10, day: 1 },
                lastDate: { year: 2026, month: 10, day: 28 },
              },
              metrics: {
                cumulative_layout_shift: { percentiles: { p75: "0.05" } },
                interaction_to_next_paint: { percentiles: { p75: 110 } },
              },
            },
          })
        : Response.json(lab),
    );
    const result = await PerformanceService.inspect(input, "example.fr");
    expect(result.field).toMatchObject({
      status: "available",
      scope: "page",
      cls: 0.05,
      inp: 110,
      lcp: null,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-28",
    });
    const cruxCall = request.mock.calls.find(([url]) =>
      requestUrl(url).includes("chromeuxreport"),
    );
    const body = cruxCall?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON body");
    expect(JSON.parse(body)).toMatchObject({
      url: input.url,
      formFactor: "PHONE",
    });
    expect(JSON.parse(body)).not.toHaveProperty("origin");
    expect(JSON.stringify(result)).not.toContain("private-test-key");
  });

  it("does not substitute origin data when CrUX has no publishable page sample", async () => {
    vi.mocked(getOptionalEnvValue).mockResolvedValue("configured-key");
    request.mockImplementation(async (url) =>
      requestUrl(url).includes("chromeuxreport")
        ? new Response(null, { status: 404 })
        : Response.json(lab),
    );
    const result = await PerformanceService.inspect(input, "example.fr");
    expect(result.field).toMatchObject({
      status: "no_data",
      lcp: null,
      inp: null,
      cls: null,
    });
    expect(result.lab.status).toBe("available");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects an unrelated site before contacting either provider", async () => {
    await expect(
      PerformanceService.inspect(
        { ...input, url: "https://example.fr.evil.test/" },
        "example.fr",
      ),
    ).rejects.toThrow("site sélectionné");
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves laboratory data when field collection fails", async () => {
    vi.mocked(getOptionalEnvValue).mockResolvedValue("configured-key");
    request.mockImplementation(async (url) =>
      requestUrl(url).includes("chromeuxreport")
        ? new Response(null, { status: 429 })
        : Response.json(lab),
    );
    const result = await PerformanceService.inspect(input, "example.fr");
    expect(result.field.status).toBe("error");
    expect(result.lab.performance).toBe(90);
  });
});
