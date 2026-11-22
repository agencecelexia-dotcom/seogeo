import { sortBy } from "remeda";

type Metric = {
  source: string;
  grain: string;
  page: string;
  date: string;
  clicks: number | null;
  impressions: number | null;
  sessions: number | null;
  keyEvents: number | null;
  fetchedAt: string;
};
type AuditPage = {
  url: string;
  title: string | null;
  statusCode: number | null;
  isIndexable: boolean;
  canonicalUrl: string | null;
};
type Geo = {
  pageUrl: string | null;
  source: string;
  metric: string;
  value: number;
  periodStart: string;
  periodEnd: string;
  country: string | null;
  device: string | null;
  query: string | null;
};
type PageDossier = {
  url: string;
  title: string | null;
  statusCode: number | null;
  indexable: boolean | null;
  canonical: string | null;
  clicks: number | null;
  impressions: number | null;
  sessions: number | null;
  keyEvents: number | null;
  gscDays: number;
  ga4Days: number;
  fetchedAt: string | null;
  backlinks: number;
  actions: number;
  geo: Geo[];
};

function pageKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

// Only exact public URLs are joined. Do not guess canonicals, collapse hosts,
// query strings or trailing slashes, or turn missing measurements into zero.
export function buildPageDossiers(input: {
  pages: AuditPage[];
  metrics: Metric[];
  geo: Geo[];
  links: { targetUrl: string }[];
  actions: { pageUrl: string; status: string }[];
}): PageDossier[] {
  const rows = new Map<string, PageDossier>();
  const dates = new Map<string, { gsc: Set<string>; ga4: Set<string> }>();
  function get(value: string) {
    const url = pageKey(value);
    if (!url) return null;
    if (!rows.has(url)) {
      rows.set(url, {
        url,
        title: null,
        statusCode: null,
        indexable: null,
        canonical: null,
        clicks: null,
        impressions: null,
        sessions: null,
        keyEvents: null,
        gscDays: 0,
        ga4Days: 0,
        fetchedAt: null,
        backlinks: 0,
        actions: 0,
        geo: [],
      });
      dates.set(url, { gsc: new Set(), ga4: new Set() });
    }
    return rows.get(url)!;
  }
  for (const page of input.pages) {
    const row = get(page.url);
    if (row)
      Object.assign(row, {
        title: page.title,
        statusCode: page.statusCode,
        indexable: page.isIndexable,
        canonical: page.canonicalUrl,
      });
  }
  for (const metric of input.metrics) {
    if (
      !(
        (metric.source === "gsc" && metric.grain === "page") ||
        (metric.source === "ga4" && metric.grain === "landing")
      )
    )
      continue;
    const row = get(metric.page);
    if (!row) continue;
    const group = dates.get(row.url)!;
    if (metric.source === "gsc") {
      group.gsc.add(metric.date);
      if (metric.clicks !== null)
        row.clicks = (row.clicks ?? 0) + metric.clicks;
      if (metric.impressions !== null)
        row.impressions = (row.impressions ?? 0) + metric.impressions;
    } else {
      group.ga4.add(metric.date);
      if (metric.sessions !== null)
        row.sessions = (row.sessions ?? 0) + metric.sessions;
      if (metric.keyEvents !== null)
        row.keyEvents = (row.keyEvents ?? 0) + metric.keyEvents;
    }
    if (!row.fetchedAt || metric.fetchedAt > row.fetchedAt)
      row.fetchedAt = metric.fetchedAt;
    row.gscDays = group.gsc.size;
    row.ga4Days = group.ga4.size;
  }
  for (const link of input.links) {
    const row = get(link.targetUrl);
    if (row) row.backlinks++;
  }
  for (const action of input.actions) {
    const row = get(action.pageUrl);
    if (row && ["todo", "planned", "done"].includes(action.status))
      row.actions++;
  }
  for (const geo of input.geo) {
    const row = geo.pageUrl ? get(geo.pageUrl) : null;
    if (row) row.geo.push(geo);
  }
  return sortBy(
    [...rows.values()],
    [(row) => row.actions, "desc"],
    [(row) => row.impressions ?? -1, "desc"],
    (row) => row.url,
  );
}
