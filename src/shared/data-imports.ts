import { z } from "zod";

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_CHARS = 1_000_000;
export const importSourceSchema = z.enum([
  "gsc_generative",
  "bing_ai",
  "backlinks",
]);
export type ImportSource = z.infer<typeof importSourceSchema>;
export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  gsc_generative: "Google · performances IA générative",
  bing_ai: "Bing · AI Performance",
  backlinks: "Backlinks · export fournisseur",
};

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const importInputSchema = z.object({
  projectId: z.string().min(1),
  source: importSourceSchema,
  fileName: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(IMPORT_MAX_CHARS),
  periodStart: dateField,
  periodEnd: dateField,
});
export type ImportInput = z.infer<typeof importInputSchema>;

export type GeoImportRow = {
  kind: "geo";
  rowKey: string;
  periodStart: string;
  periodEnd: string;
  pageUrl: string | null;
  query: string | null;
  country: string | null;
  device: string | null;
  metric: "impressions" | "citations";
  value: number;
};
export type BacklinkImportRow = {
  kind: "backlink";
  rowKey: string;
  sourceUrl: string;
  targetUrl: string;
  anchor: string | null;
  rel: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
};
export type ImportRow = GeoImportRow | BacklinkImportRow;
export type ImportPreview = {
  headers: string[];
  totalRows: number;
  duplicates: number;
  rows: ImportRow[];
  errors: { row: number; message: string }[];
};
