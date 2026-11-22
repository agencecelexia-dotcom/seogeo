import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { env, waitUntil } from "./workers";
import { withPgClient } from "@/db";
import { setRuntimeAuthMode } from "@/lib/auth-mode";
import {
  createOpenSeoOAuthProvider,
  type OpenSeoOAuthEnv,
} from "@/server/mcp/oauth-provider";
import { requestWithPublicOrigin } from "@/server/mcp/public-origin";
import { withDataforseoSlots } from "@/server/lib/dataforseo/request-slots";
import { ENFORCED_CSP } from "@/server/lib/csp";
import { handleOperatorRequest } from "@/server/standalone/admin";
import { handleCronRequest } from "./cron";
import { configurationResponse } from "./configuration";

const startHandler = createStartHandler(defaultStreamHandler);
const provider = createOpenSeoOAuthProvider((request) =>
  startHandler(request, { context: { cspNonce: crypto.randomUUID() } }),
);

async function handleRequest(request: Request): Promise<Response> {
  setRuntimeAuthMode("password");
  const publicRequest = requestWithPublicOrigin(request);
  const pathname = new URL(publicRequest.url).pathname;
  if (pathname === "/api/cron") return handleCronRequest(publicRequest);
  if (pathname === "/api/cron/workflows")
    return handleCronRequest(publicRequest, "workflows");
  if (pathname === "/api/standalone/admin")
    return handleOperatorRequest(publicRequest);
  if (pathname.startsWith("/agents/"))
    return Response.json(
      {
        error:
          "Le chat intégré est indisponible sur Vercel. Utilisez la connexion MCP.",
      },
      { status: 503 },
    );
  if (pathname === "/api/ai-visibility/download") {
    return (
      await import("@/server/features/ai-visibility/services/aiVisibilityExport")
    ).handleAiVisibilityDownload(publicRequest);
  }
  return provider.fetch(publicRequest, env as OpenSeoOAuthEnv, {
    waitUntil,
    passThroughOnException() {},
    props: {},
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const setup = configurationResponse(request);
    if (setup) return setup;
    const response = await withPgClient(() =>
      withDataforseoSlots(() => handleRequest(request)),
    );
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set("Cache-Control", "private, no-store");
    if (new URL(request.url).protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    if (
      headers.get("content-type")?.startsWith("text/html") &&
      !headers.has("content-security-policy")
    )
      headers.set("Content-Security-Policy", ENFORCED_CSP);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
