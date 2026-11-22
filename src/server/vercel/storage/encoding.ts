import { z } from "zod";

export type StorageBody =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | Blob;
export function checkKey(key: string, maxBytes = 1024) {
  if (!key || Buffer.byteLength(key) > maxBytes)
    throw new Error("Storage key is empty or too long.");
}
export async function bodyBytes(
  body: StorageBody,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof body === "string") bytes = new TextEncoder().encode(body);
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else if (ArrayBuffer.isView(body))
    bytes = Uint8Array.from(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    );
  else if (body instanceof Blob) {
    if (body.size > maxBytes)
      throw new Error("Storage value exceeds the supported size.");
    bytes = new Uint8Array(await body.arrayBuffer());
  } else {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("Storage value exceeds the supported size.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  }
  if (bytes.byteLength > maxBytes)
    throw new Error("Storage value exceeds the supported size.");
  return bytes;
}
const cursorSchema = z.object({
  namespace: z.string(),
  prefix: z.string(),
  key: z.string(),
});
export function readCursor(
  cursor: string | null | undefined,
  namespace: string,
  prefix: string,
): string {
  if (!cursor) return "";
  let parsed: z.infer<typeof cursorSchema>;
  try {
    parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("Invalid storage cursor.");
  }
  if (parsed.namespace !== namespace || parsed.prefix !== prefix)
    throw new Error("Storage cursor belongs to a different list.");
  return parsed.key;
}
export function writeCursor(key: string, namespace: string, prefix: string) {
  return Buffer.from(JSON.stringify({ key, namespace, prefix })).toString(
    "base64url",
  );
}
export function listLimit(limit = 1000) {
  return z.number().int().min(1).max(1000).parse(limit);
}
export function metadataJson(value: unknown) {
  const json = JSON.stringify(value ?? null);
  if (Buffer.byteLength(json) > 16 * 1024)
    throw new Error("Storage metadata exceeds 16 KiB.");
  return json;
}
