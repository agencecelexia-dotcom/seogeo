import { z } from "zod";
import type { runtimeBlobObjects } from "@/db/vercel-runtime.schema";

const stringMap = z.record(z.string(), z.string());
const httpSchema = z.object({
  contentType: z.string().optional(),
  contentLanguage: z.string().optional(),
  contentDisposition: z.string().optional(),
  contentEncoding: z.string().optional(),
  cacheControl: z.string().optional(),
  cacheExpiry: z.string().optional(),
});
const headersByField = {
  contentType: "Content-Type",
  contentLanguage: "Content-Language",
  contentDisposition: "Content-Disposition",
  contentEncoding: "Content-Encoding",
  cacheControl: "Cache-Control",
} as const;
export function normalizeHttpMetadata(input?: R2HTTPMetadata | Headers) {
  if (input instanceof Headers) {
    return Object.fromEntries(
      Object.entries(headersByField).flatMap(([field, header]) =>
        input.has(header) ? [[field, input.get(header)]] : [],
      ),
    );
  }
  return httpSchema.parse({
    ...input,
    ...(input?.cacheExpiry
      ? { cacheExpiry: new Date(input.cacheExpiry).toISOString() }
      : {}),
  });
}
export function blobMetadata(row: typeof runtimeBlobObjects.$inferSelect) {
  const stored = httpSchema.parse(JSON.parse(row.httpMetadata));
  const customMetadata = stringMap.parse(JSON.parse(row.customMetadata));
  const httpMetadata = {
    ...stored,
    ...(stored.cacheExpiry
      ? { cacheExpiry: new Date(stored.cacheExpiry) }
      : { cacheExpiry: undefined }),
  };
  const etag = row.etag.replace(/^"|"$/g, "");
  return {
    key: row.key,
    version: row.etag,
    size: row.size,
    etag,
    httpEtag: `"${etag}"`,
    uploaded: new Date(row.uploadedAt),
    httpMetadata,
    customMetadata,
    storageClass: "Standard",
    checksums: { toJSON: () => ({}) },
    writeHttpMetadata(headers: Headers) {
      for (const [field, header] of Object.entries(headersByField)) {
        const value: unknown = Reflect.get(stored, field);
        if (typeof value === "string") headers.set(header, value);
      }
      if (httpMetadata.cacheExpiry)
        headers.set("Expires", httpMetadata.cacheExpiry.toUTCString());
    },
  };
}
export function normalizeCustomMetadata(input: unknown) {
  return stringMap.parse(input ?? {});
}
