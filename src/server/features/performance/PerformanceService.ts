import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { PerformanceRepository } from "./PerformanceRepository";

const inputSchema = z.object({
  url: z.string().url().max(4096),
  strategy: z.enum(["mobile", "desktop"]),
});

const day = (value: { year: number; month: number; day: number }) =>
  `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;

async function inspect(
  input: z.infer<typeof inputSchema>,
  projectDomain: string,
) {
  inputSchema.parse(input);
  const page = new URL(input.url);
  const domain = new URL(
    projectDomain.includes("://") ? projectDomain : `https://${projectDomain}`,
  ).hostname.replace(/^www\./, "");
  const host = page.hostname.replace(/^www\./, "");
  if (
    !isCrawlableUrl(page.href) ||
    page.username ||
    page.password ||
    (host !== domain && !host.endsWith(`.${domain}`))
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Choisir une page publique du site sélectionné.",
    );
  page.hash = "";
  const [lab, field] = await Promise.allSettled([
    PerformanceRepository.readLab(page.href, input.strategy),
    PerformanceRepository.readField(page.href, input.strategy),
  ]);
  const labData =
    lab.status === "fulfilled" && !lab.value.runtimeError ? lab.value : null;
  const fieldData =
    field.status === "fulfilled" && field.value.status === "available"
      ? field.value.record
      : null;
  const p75 = (name: string) => {
    const value = fieldData?.metrics[name]?.percentiles?.p75;
    return value === undefined ? null : Number(value);
  };
  const labMetric = (name: string) =>
    labData?.audits?.[name]?.numericValue ?? null;
  return {
    url: page.href,
    strategy: input.strategy,
    measuredAt: new Date().toISOString(),
    lab: {
      status: labData ? ("available" as const) : ("error" as const),
      finalUrl: labData?.finalUrl ?? null,
      measuredAt: labData?.fetchTime ?? null,
      version: labData?.lighthouseVersion ?? null,
      performance:
        labData?.categories?.performance?.score == null
          ? null
          : Math.round(labData.categories.performance.score * 100),
      lcp: labMetric("largest-contentful-paint"),
      cls: labMetric("cumulative-layout-shift"),
      tbt: labMetric("total-blocking-time"),
    },
    field: {
      status:
        field.status === "fulfilled" ? field.value.status : ("error" as const),
      scope: "page" as const,
      url: fieldData?.key.url ?? null,
      periodStart: fieldData?.collectionPeriod
        ? day(fieldData.collectionPeriod.firstDate)
        : null,
      periodEnd: fieldData?.collectionPeriod
        ? day(fieldData.collectionPeriod.lastDate)
        : null,
      lcp: p75("largest_contentful_paint"),
      inp: p75("interaction_to_next_paint"),
      cls: p75("cumulative_layout_shift"),
      ttfb: p75("experimental_time_to_first_byte"),
    },
  };
}

export const PerformanceService = { inspect };
