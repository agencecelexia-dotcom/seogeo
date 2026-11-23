import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenRouterAccess } from "@/server/lib/openrouter";
import {
  getWorkersEnv,
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const OPENROUTER_KEY_MISSING_MESSAGE =
  "OPENROUTER_API_KEY is not set for this deployment yet. Add it to your environment, restart OpenSEO, then confirm here.";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type ProviderAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

async function openRouterAccessStatus(): Promise<ProviderAccessStatus> {
  if (await isHostedServerAuthMode()) {
    return { enabled: true, errorMessage: null };
  }
  // Behind an Every App gateway this is the gateway's binding; the gateway
  // answers 503 until an admin sets its OPENROUTER_API_KEY.
  const enabled = Boolean(getOpenRouterAccess((await getWorkersEnv()) ?? {}));
  return {
    enabled,
    errorMessage: enabled ? null : OPENROUTER_KEY_MISSING_MESSAGE,
  };
}

// Research and prompt generation use OpenRouter independently of whether
// this runtime supports SAM's interactive agent.
export const getOpenRouterAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(openRouterAccessStatus);

// Gates the in-app AI agent (SAM) on an OpenRouter key being configured, the
// same way backlinks/AI-search gate on their DataForSEO subscriptions. Hosted
// deployments always have the key provisioned, so only self-hosted is checked.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<ProviderAccessStatus> => {
    if ((await getOptionalEnvValue("RUNTIME_PLATFORM")) === "vercel") {
      return {
        enabled: false,
        errorMessage:
          "L’agent SAM intégré n’est pas disponible dans cette version Vercel. Utilisez votre assistant externe via MCP.",
      };
    }
    return openRouterAccessStatus();
  });
