import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthenticatedOpenSeoMcpRequest } from "./transport";
import { createWorkersOAuthMcpProps, type McpProps } from "./context";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("agents/mcp/server", () => {
  throw new Error("Workers transport must not load in Node");
});
vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://private.example.com",
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getMembership: vi.fn() },
}));
vi.mock("@/server/auth/repositories/GuestAccountRepository", () => ({
  GuestAccountRepository: {},
}));
vi.mock("@/middleware/ensure-user/cloudflareAccess", () => ({
  resolveCloudflareAccessContext: vi.fn(),
}));
vi.mock("@/middleware/ensure-user/delegated", () => ({
  resolveLocalNoAuthContext: vi.fn(),
}));
vi.mock("./server", async () => {
  const { McpServer } = await import("@modelcontextprotocol/server");
  return {
    createOpenSeoMcpServer: (props: McpProps) => {
      const server = new McpServer({ name: "node-test", version: "1.0.0" });
      server.registerTool("identity", {}, () => ({
        content: [{ type: "text", text: props.openSeoAuth.organizationId }],
      }));
      return server;
    },
  };
});

const context: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};
beforeEach(() => {
  vi.stubEnv("RUNTIME_PLATFORM", "vercel");
  vi.mocked(AuthRepository.getMembership).mockResolvedValue({ role: "owner" });
});
afterEach(() => vi.unstubAllEnvs());

function call(organizationId: string, modern = true, origin?: string) {
  const props = createWorkersOAuthMcpProps({
    userId: "user-1",
    userEmail: "user@example.com",
    organizationId,
    baseUrl: "https://private.example.com",
    clientId: "api_key",
    scopes: ["mcp"],
  });
  return handleAuthenticatedOpenSeoMcpRequest(
    new Request("https://private.example.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(origin ? { Origin: origin } : {}),
        ...(modern
          ? {
              "Mcp-Method": "tools/call",
              "Mcp-Name": "identity",
              "MCP-Protocol-Version": "2026-07-28",
            }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "identity",
          arguments: {},
          ...(modern
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {}),
        },
      }),
    }),
    props,
    {},
    context,
  );
}

describe("Vercel MCP transport", () => {
  it.each([true, false])(
    "serves %s-era JSON without Workers transport or persistent sessions",
    async (modern) => {
      const response = await call("org-a", modern);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(response.headers.get("mcp-session-id")).toBeNull();
      expect(await response.json()).toMatchObject({
        result: { content: [{ type: "text", text: "org-a" }] },
      });
    },
  );
  it("isolates identities across concurrent requests on the same Node process", async () => {
    const responses = await Promise.all([call("org-a"), call("org-b")]);
    const results = await Promise.all(
      responses.map((response) => response.text()),
    );
    expect(results[0]).toContain("org-a");
    expect(results[0]).not.toContain("org-b");
    expect(results[1]).toContain("org-b");
  });
  it("rejects revoked membership before serving any tools", async () => {
    vi.mocked(AuthRepository.getMembership).mockResolvedValue(null);
    expect((await call("removed-org")).status).toBe(401);
  });
  it("rejects a cross-origin browser request", async () => {
    expect((await call("org-a", true, "https://evil.example")).status).toBe(
      403,
    );
  });
});
