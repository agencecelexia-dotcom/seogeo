import { EventEmitter } from "node:events";
import { IncomingMessage, type RequestOptions } from "node:http";
import type * as HttpModule from "node:http";
import type * as HttpsModule from "node:https";
import { Socket } from "node:net";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nodePublicFetch } from "./public-fetch";

const io = vi.hoisted(() => ({
  lookup: vi.fn(),
  request:
    vi.fn<
      (
        url: URL,
        options: RequestOptions,
        callback: (message: IncomingMessage) => void,
      ) => EventEmitter & { end: () => void }
    >(),
  headers: {} as Record<string, string>,
  status: 200,
  body: Buffer.from("ok"),
  respond: true,
}));
vi.mock("node:dns/promises", () => ({ lookup: io.lookup }));
vi.mock("node:http", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpModule>()),
  request: io.request,
}));
vi.mock("node:https", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpsModule>()),
  request: io.request,
}));

beforeEach(() => {
  io.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
  io.headers = {};
  io.status = 200;
  io.body = Buffer.from("ok");
  io.respond = true;
  io.request.mockImplementation(
    (
      _url: URL,
      options: RequestOptions,
      callback: (message: IncomingMessage) => void,
    ) => {
      const request = new EventEmitter();
      const message = new IncomingMessage(new Socket());
      message.statusCode = io.status;
      message.headers = io.headers;
      const abort = () => {
        const error = new DOMException("Aborted", "AbortError");
        request.emit("error", error);
        message.destroy(error);
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      message.once("close", () =>
        options.signal?.removeEventListener("abort", abort),
      );
      return Object.assign(request, {
        end: () => {
          if (!io.respond) return;
          queueMicrotask(() => {
            callback(message);
            message.push(io.body);
            message.push(null);
          });
        },
      });
    },
  );
});

describe("DNS-pinned Node public fetch", () => {
  it.each([
    "http://127.1",
    "http://2130706433",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:7f00:1]",
    "http://[fc00::1]",
    "http://[64:ff9b::a00:1]",
    "http://192.0.2.1",
    "http://user:pass@example.com",
    "http://example.com:9000",
    "file:///etc/passwd",
  ])("blocks %s before connecting", async (url) => {
    await expect(nodePublicFetch(url)).rejects.toThrow();
    expect(io.request).not.toHaveBeenCalled();
  });

  it("rejects mixed public/private DNS answers", async () => {
    io.lookup.mockResolvedValue([
      { address: "1.1.1.1", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(nodePublicFetch("https://example.com")).rejects.toThrow(
      "non-public",
    );
    expect(io.request).not.toHaveBeenCalled();
  });

  it("pins the approved IP while retaining the original TLS host and dropping credentials", async () => {
    const response = await nodePublicFetch("https://example.com/path", {
      headers: {
        cookie: "private",
        authorization: "Bearer secret",
        host: "evil.example",
        "x-api-key": "secret",
        signature: "signed",
        "user-agent": "OpenSEO",
      },
    });
    expect(await response.text()).toBe("ok");
    const [url, options] = io.request.mock.calls[0];
    expect(url.hostname).toBe("example.com");
    expect(options).toMatchObject({
      agent: false,
      autoSelectFamily: false,
      headers: {
        "user-agent": "OpenSEO",
        "accept-encoding": "identity",
        signature: "signed",
      },
    });
    const pinned = vi.fn();
    options.lookup?.("example.com", {}, pinned);
    expect(pinned).toHaveBeenCalledWith(null, "1.1.1.1", 4);
    expect(io.lookup).toHaveBeenCalledTimes(1);
    expect(options.headers).not.toHaveProperty("cookie");
    expect(options.headers).not.toHaveProperty("authorization");
    expect(options.headers).not.toHaveProperty("host");
    expect(options.headers).not.toHaveProperty("x-api-key");
  });

  it("returns redirects manually and blocks a private next hop", async () => {
    io.status = 302;
    io.headers = { location: "http://127.0.0.1/private" };
    const response = await nodePublicFetch("https://example.com", {
      redirect: "follow",
    });
    expect(response.status).toBe(302);
    await response.body?.cancel();
    await expect(
      nodePublicFetch(response.headers.get("location")!),
    ).rejects.toThrow("non-public");
    expect(io.request).toHaveBeenCalledTimes(1);
  });

  it("aborts DNS waiting without ever starting a request", async () => {
    io.lookup.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = nodePublicFetch("https://example.com", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(io.request).not.toHaveBeenCalled();
  });

  it("passes abort to the in-flight socket request", async () => {
    io.respond = false;
    const controller = new AbortController();
    const result = nodePublicFetch("https://example.com", {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(io.request).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("caps decoded responses instead of trusting compressed content length", async () => {
    io.body = gzipSync(Buffer.alloc(21 * 1024 * 1024));
    io.headers = {
      "content-encoding": "gzip",
      "content-length": String(io.body.length),
    };
    const response = await nodePublicFetch("https://example.com");
    expect(response.headers.get("content-length")).toBeNull();
    await expect(response.arrayBuffer()).rejects.toThrow("20 MiB");
  });
});
