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

type Format = "text" | "json" | "arrayBuffer" | "stream";
type ReadOptions = Format | { type?: Format; cacheTtl?: number };
function decode(value: string, options?: ReadOptions): unknown {
  const bytes = Uint8Array.from(Buffer.from(value, "base64"));
  const type =
    typeof options === "string" ? options : (options?.type ?? "text");
  if (type === "arrayBuffer") return bytes.buffer;
  if (type === "stream") return new Response(bytes).body;
  const text = new TextDecoder().decode(bytes);
  return type === "json" ? JSON.parse(text) : text;
}

export function createPostgresKv(namespace = "cache") {
  checkKey(namespace, 128);
  async function get(
    key: string,
    options?: "text" | { type?: "text"; cacheTtl?: number },
  ): Promise<string | null>;
  async function get<T = unknown>(
    key: string,
    options: "json" | { type: "json"; cacheTtl?: number },
  ): Promise<T | null>;
  async function get(
    key: string,
    options: "arrayBuffer" | { type: "arrayBuffer" },
  ): Promise<ArrayBuffer | null>;
  async function get(
    key: string,
    options: "stream" | { type: "stream" },
  ): Promise<ReadableStream | null>;
  async function get(key: string, options?: ReadOptions): Promise<unknown> {
    checkKey(key, 512);
    const row = await withStorageRepository((repository) =>
      repository.getKv(namespace, key, new Date().toISOString()),
    );
    return row ? decode(row.value, options) : null;
  }
  async function getWithMetadata(key: string, options?: ReadOptions) {
    checkKey(key, 512);
    const row = await withStorageRepository((repository) =>
      repository.getKv(namespace, key, new Date().toISOString()),
    );
    return {
      value: row ? decode(row.value, options) : null,
      metadata: row?.metadata ? (JSON.parse(row.metadata) as unknown) : null,
      cacheStatus: null,
    };
  }
  async function put(
    key: string,
    value: StorageBody,
    options: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: unknown;
    } = {},
  ) {
    checkKey(key, 512);
    const now = new Date();
    const expires =
      options.expiration !== undefined
        ? options.expiration * 1000
        : options.expirationTtl !== undefined
          ? now.getTime() + options.expirationTtl * 1000
          : null;
    if (
      expires !== null &&
      (!Number.isFinite(expires) || expires <= now.getTime())
    )
      throw new Error("KV expiration must be in the future.");
    const bytes = await bodyBytes(value, 25 * 1024 * 1024);
    await withStorageRepository((repository) =>
      repository.putKv({
        namespace,
        key,
        value: Buffer.from(bytes).toString("base64"),
        metadata: metadataJson(options.metadata),
        expiresAt: expires === null ? null : new Date(expires).toISOString(),
        updatedAt: now.toISOString(),
      }),
    );
  }
  async function remove(key: string) {
    checkKey(key, 512);
    await withStorageRepository((repository) =>
      repository.deleteKv(namespace, key),
    );
  }
  async function list(
    options: {
      limit?: number;
      prefix?: string | null;
      cursor?: string | null;
    } = {},
  ) {
    const prefix = options.prefix ?? "";
    const limit = listLimit(options.limit);
    const rows = await withStorageRepository((repository) =>
      repository.listKv({
        namespace,
        prefix,
        after: readCursor(options.cursor, namespace, prefix),
        limit,
        now: new Date().toISOString(),
      }),
    );
    const page = rows.slice(0, limit);
    return {
      keys: page.map((row) => ({
        name: row.key,
        ...(row.expiresAt
          ? { expiration: Date.parse(row.expiresAt) / 1000 }
          : {}),
        metadata: row.metadata
          ? (JSON.parse(row.metadata) as unknown)
          : undefined,
      })),
      list_complete: rows.length <= limit,
      ...(rows.length > limit
        ? { cursor: writeCursor(page[page.length - 1].key, namespace, prefix) }
        : {}),
      cacheStatus: null,
    };
  }
  return { get, getWithMetadata, put, delete: remove, list };
}
