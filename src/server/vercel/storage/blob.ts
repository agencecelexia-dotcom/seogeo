import { get as getPrivateBlob, put as putPrivateBlob } from "@vercel/blob";
import {
  bodyBytes,
  checkKey,
  listLimit,
  metadataJson,
  readCursor,
  writeCursor,
  type StorageBody,
} from "./encoding";
import { withStorageRepository } from "./storage-context";
import {
  blobMetadata,
  normalizeCustomMetadata,
  normalizeHttpMetadata,
} from "./blob-metadata";

// Covers the actual app's R2 surface; unsupported conditional/range requests
// fail explicitly instead of returning a misleading full object.
export function createVercelBlobBucket() {
  async function get(key: string, options?: R2GetOptions) {
    checkKey(key);
    if (options && Object.keys(options).length)
      throw new Error(
        "Vercel storage does not support R2 conditional or range reads.",
      );
    const row = await withStorageRepository((repository) =>
      repository.getBlob(key),
    );
    if (!row) return null;
    const result = await getPrivateBlob(row.blobUrl, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(60_000),
    });
    if (!result || result.statusCode !== 200) return null;
    const response = new Response(result.stream);
    return {
      ...blobMetadata(row),
      body: response.body,
      get bodyUsed() {
        return response.bodyUsed;
      },
      text: () => response.text(),
      arrayBuffer: () => response.arrayBuffer(),
      bytes: async () => new Uint8Array(await response.arrayBuffer()),
      blob: () => response.blob(),
      json: async (): Promise<unknown> => response.json(),
    };
  }
  async function head(key: string) {
    checkKey(key);
    const row = await withStorageRepository((repository) =>
      repository.getBlob(key),
    );
    return row ? blobMetadata(row) : null;
  }
  async function put(
    key: string,
    body: StorageBody,
    options: R2PutOptions = {},
  ) {
    checkKey(key);
    if (
      Object.keys(options).some(
        (name) => name !== "httpMetadata" && name !== "customMetadata",
      )
    )
      throw new Error(
        "Vercel storage supports HTTP/custom metadata only for R2 writes.",
      );
    const bytes = await bodyBytes(body, 32 * 1024 * 1024);
    const http = normalizeHttpMetadata(options.httpMetadata);
    const custom = normalizeCustomMetadata(options.customMetadata);
    const httpMetadata = metadataJson(http);
    const customMetadata = metadataJson(custom);
    const result = await putPrivateBlob(
      `seogeo-runtime/${crypto.randomUUID()}`,
      Buffer.from(bytes),
      {
        access: "private",
        addRandomSuffix: false,
        contentType:
          typeof http.contentType === "string"
            ? http.contentType
            : "application/octet-stream",
        abortSignal: AbortSignal.timeout(60_000),
      },
    );
    const expiration = custom.expiresAt ? Date.parse(custom.expiresAt) : NaN;
    const entry = {
      key,
      blobUrl: result.url,
      size: bytes.byteLength,
      etag: result.etag,
      httpMetadata,
      customMetadata,
      uploadedAt: new Date().toISOString(),
      expiresAt: Number.isFinite(expiration)
        ? new Date(expiration).toISOString()
        : null,
    };
    // Immutable URLs plus an atomic index exchange prevent overwrites from
    // pairing one writer's payload with another writer's metadata.
    await withStorageRepository((repository) => repository.publishBlob(entry));
    return blobMetadata(entry);
  }
  async function remove(input: string | string[]) {
    const keys = Array.isArray(input) ? input : [input];
    if (keys.length > 1000)
      throw new Error("Delete at most 1000 objects per call.");
    keys.forEach((key) => checkKey(key));
    for (let offset = 0; offset < keys.length; offset += 50)
      await withStorageRepository((repository) =>
        repository.deleteBlobs(keys.slice(offset, offset + 50)),
      );
  }
  async function list(
    options: {
      prefix?: string;
      cursor?: string;
      limit?: number;
      include?: string[];
      delimiter?: string;
    } = {},
  ) {
    if (options.delimiter)
      throw new Error("Vercel storage does not support delimited R2 listings.");
    const prefix = options.prefix ?? "";
    const limit = listLimit(options.limit);
    const rows = await withStorageRepository((repository) =>
      repository.listBlobs({
        prefix,
        after: readCursor(options.cursor, "blob", prefix),
        limit,
      }),
    );
    const page = rows.slice(0, limit);
    return {
      objects: page.map(blobMetadata),
      delimitedPrefixes: [],
      truncated: rows.length > limit,
      ...(rows.length > limit
        ? { cursor: writeCursor(page[page.length - 1].key, "blob", prefix) }
        : {}),
    };
  }
  return { get, head, put, delete: remove, list };
}
