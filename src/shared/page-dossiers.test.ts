import { describe, expect, it } from "vitest";
import { buildPageDossiers } from "./page-dossiers";
const metric = (overrides = {}) => ({
  source: "gsc",
  grain: "page",
  page: "https://example.com/a",
  date: "2026-11-01",
  clicks: 2,
  impressions: 10,
  sessions: null,
  keyEvents: null,
  fetchedAt: "2026-11-04",
  ...overrides,
});
const empty = { pages: [], metrics: [], geo: [], links: [], actions: [] };
describe("page dossiers", () => {
  it("does not add property totals to page metrics or fabricate conversions", () => {
    const [page] = buildPageDossiers({
      ...empty,
      metrics: [
        metric(),
        metric({ grain: "site", page: "", clicks: 500 }),
        metric({
          source: "ga4",
          grain: "landing",
          clicks: null,
          impressions: null,
          sessions: 8,
        }),
      ],
    });
    expect(page).toMatchObject({
      clicks: 2,
      impressions: 10,
      sessions: 8,
      keyEvents: null,
      gscDays: 1,
      ga4Days: 1,
    });
  });
  it("preserves distinct URL paths and leaves absent audit evidence unknown", () => {
    const pages = buildPageDossiers({
      ...empty,
      metrics: [metric(), metric({ page: "https://example.com/a/" })],
    });
    expect(pages).toHaveLength(2);
    expect(pages.every((page) => page.indexable === null)).toBe(true);
  });
  it("keeps overlapping GEO exports as separate evidence", () => {
    const geo = {
      pageUrl: "https://example.com/a",
      source: "gsc_generative",
      metric: "impressions",
      value: 20,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-07",
      country: null,
      device: null,
      query: null,
    };
    const [page] = buildPageDossiers({
      ...empty,
      geo: [geo, { ...geo, country: "FR", value: 15 }],
    });
    expect(page.geo.map((row) => row.value)).toEqual([20, 15]);
    expect(page.impressions).toBeNull();
  });
});
