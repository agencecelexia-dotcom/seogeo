import {
  request as httpRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { Transform, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { resolveTarget } from "../../../scripts/celld/runtime/crawl-gateway.mjs";

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "location",
  "last-modified",
  "etag",
  "retry-after",
  "link",
  "x-robots-tag",
  "cf-mitigated",
  "cf-ray",
  "powered-by",
];

async function resolveBeforeAbort(input: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      resolveTarget(input),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function crawlerHeaders(init: RequestInit, url: URL) {
  const incoming = new Headers(init.headers);
  const headers: Record<string, string> = {
    "user-agent": incoming.get("user-agent") ?? "OpenSEO-Audit/1.0",
    accept: incoming.get("accept") ?? "*/*",
    "accept-encoding": "identity",
  };
  if (url.protocol === "https:") {
    for (const name of ["signature", "signature-input", "signature-agent"]) {
      const value = incoming.get(name);
      if (value) headers[name] = value;
    }
  }
  return headers;
}

function responseFromMessage(message: IncomingMessage, method: string) {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = message.headers[name];
    if (value)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const status = message.statusCode ?? 502;
  if (method === "HEAD" || [204, 205, 304].includes(status)) {
    message.resume();
    return new Response(null, { status, headers });
  }

  // Some origins ignore accept-encoding: identity. Match fetch's decoded-body
  // contract and apply the size cap after decompression, including gzip bombs.
  const encoding = message.headers["content-encoding"]?.toLowerCase();
  const decoder =
    encoding === "gzip"
      ? createGunzip()
      : encoding === "br"
        ? createBrotliDecompress()
        : encoding === "deflate"
          ? createInflate()
          : null;
  if (encoding && encoding !== "identity" && !decoder) {
    message.destroy();
    throw new Error("Unsupported crawl response encoding");
  }
  if (decoder) headers.delete("content-length");
  let bytes = 0;
  const limited = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES)
        callback(new Error("Crawl response exceeds 20 MiB"));
      else callback(null, chunk);
    },
  });
  // pipeline propagates errors/cancellation to every stream in both directions.
  if (decoder) pipeline(message, decoder, limited, () => {});
  else pipeline(message, limited, () => {});
  const iterator = limited[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else if (next.value instanceof Uint8Array) controller.enqueue(next.value);
      else throw new Error("Unexpected crawl response chunk");
    },
    cancel() {
      limited.destroy();
    },
  });
  return new Response(body, { status, headers });
}

/** Public-only GET/HEAD transport. Every redirect must re-enter this function. */
export async function nodePublicFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method) || init.body != null)
    throw new Error("Crawl transport accepts GET and HEAD without a body");
  const timeout = AbortSignal.timeout(30_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const { url, address } = await resolveBeforeAbort(String(input), signal);
  signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      method,
      agent: false,
      autoSelectFamily: false,
      // Keep the URL's host/SNI/certificate check, while connecting only to the
      // address already validated. No second system lookup can rebind it.
      lookup: (_host, _options, callback) =>
        callback(null, address.address, address.family),
      headers: crawlerHeaders(init, url),
      signal,
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      options,
      (message) => {
        try {
          // Node never follows redirects. The caller must validate the next hop.
          if (
            init.redirect === "error" &&
            (message.statusCode ?? 0) >= 300 &&
            (message.statusCode ?? 0) < 400
          ) {
            message.destroy();
            throw new Error("Crawl redirect is disallowed");
          }
          resolve(responseFromMessage(message, method));
        } catch (error) {
          message.destroy();
          reject(error);
        }
      },
    );
    request.once("error", reject);
    request.once("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("Crawl protocol upgrades are disallowed"));
    });
    request.end();
  });
}
