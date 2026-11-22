import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { mcpWidgets } from "./vite-plugin-mcp-widgets";

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(loaded)) process.env[key] ??= value;
  process.env.RUNTIME_PLATFORM = "vercel";
  process.env.AUTH_MODE = "password";
  process.env.DATABASE_PROVIDER = "postgres";
  process.env.OPENSEO_TELEMETRY_DISABLED ??= "true";
  process.env.DO_NOT_TRACK ??= "1";
  const local = mode === "node";
  const workerBridge = fileURLToPath(
    new URL("./src/server/vercel/workers.ts", import.meta.url),
  );
  const workflowBridge = fileURLToPath(
    new URL("./src/server/vercel/workflow-errors.ts", import.meta.url),
  );
  const nodeBridge = fileURLToPath(
    new URL("./src/server/vercel/unsupported-node-bridge.ts", import.meta.url),
  );
  const agentsBridge = fileURLToPath(
    new URL("./src/server/vercel/unsupported-agents.ts", import.meta.url),
  );
  const runtimeAliases = {
    "cloudflare:workers": workerBridge,
    "cloudflare:workflows": workflowBridge,
    "cloudflare:node": nodeBridge,
  };
  return {
    publicDir: "src/public",
    resolve: {
      tsconfigPaths: true,
      alias: [
        ...Object.entries(runtimeAliases).map(([find, replacement]) => ({
          find,
          replacement,
        })),
        { find: /^agents$/, replacement: agentsBridge },
        { find: /^agents\/mcp\/server$/, replacement: agentsBridge },
      ],
    },
    define: {
      "import.meta.env.VITE_RUNTIME_PLATFORM": JSON.stringify("vercel"),
      "import.meta.env.AUTH_MODE": JSON.stringify("password"),
    },
    server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 3104) },
    ssr: { noExternal: ["@cloudflare/workers-oauth-provider"] },
    plugins: [
      mcpWidgets(),
      tanstackStart({ server: { entry: "server/vercel/entry.ts" } }),
      nitro({
        preset: local ? "node-server" : "vercel",
        alias: runtimeAliases,
        vercel: { functions: { runtime: "nodejs24.x", maxDuration: 800 } },
      }),
      react(),
      tailwindcss(),
    ],
  };
});
