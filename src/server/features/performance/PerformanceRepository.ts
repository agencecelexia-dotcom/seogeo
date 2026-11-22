import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const auditSchema = z.object({ numericValue: z.number().finite().optional() });
const labSchema = z.object({
  lighthouseResult: z.object({
    finalUrl: z.string().optional(),
    fetchTime: z.string().optional(),
    lighthouseVersion: z.string().optional(),
    runtimeError: z.object({ code: z.string() }).optional(),
    categories: z
      .object({
        performance: z
          .object({ score: z.number().min(0).max(1).nullable() })
          .optional(),
      })
      .optional(),
    audits: z.record(z.string(), auditSchema).optional(),
  }),
});
const cruxDate = z.object({
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
});
const fieldSchema = z.object({
  record: z.object({
    key: z.object({ url: z.string(), formFactor: z.string().optional() }),
    collectionPeriod: z
      .object({ firstDate: cruxDate, lastDate: cruxDate })
      .optional(),
    metrics: z.record(
      z.string(),
      z.object({
        percentiles: z
          .object({
            p75: z.union([
              z.number().nonnegative(),
              z.string().regex(/^\d+(\.\d+)?$/),
            ]),
          })
          .optional(),
      }),
    ),
  }),
});

async function readLab(url: string, strategy: "mobile" | "desktop") {
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("locale", "fr");
  const key = await getOptionalEnvValue("GOOGLE_PAGESPEED_API_KEY");
  if (key) endpoint.searchParams.set("key", key);
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(55_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`PageSpeed HTTP ${response.status}`);
  return labSchema.parse(await response.json()).lighthouseResult;
}

async function readField(url: string, strategy: "mobile" | "desktop") {
  const key = await getOptionalEnvValue("GOOGLE_CRUX_API_KEY");
  if (!key) return { status: "not_configured" as const };
  const endpoint = new URL(
    "https://chromeuxreport.googleapis.com/v1/records:queryRecord",
  );
  endpoint.searchParams.set("key", key);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formFactor: strategy === "mobile" ? "PHONE" : "DESKTOP",
      metrics: [
        "largest_contentful_paint",
        "interaction_to_next_paint",
        "cumulative_layout_shift",
        "experimental_time_to_first_byte",
      ],
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (response.status === 404) return { status: "no_data" as const };
  if (!response.ok) throw new Error(`CrUX HTTP ${response.status}`);
  return {
    status: "available" as const,
    record: fieldSchema.parse(await response.json()).record,
  };
}

export const PerformanceRepository = { readLab, readField };
