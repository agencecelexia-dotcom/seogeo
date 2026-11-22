import { waitUntil as vercelWaitUntil } from "@vercel/functions";
import { applyVercelEnvironmentDefaults } from "./configuration";

// This module is selected only by the Vercel build. Keep helpers that read
// process.env aligned with the fixed binding values and the password-only UI.
process.env.RUNTIME_PLATFORM = "vercel";
process.env.AUTH_MODE = "password";
process.env.DATABASE_PROVIDER = "postgres";
process.env.OPENSEO_TELEMETRY_DISABLED = "true";
process.env.DO_NOT_TRACK = "1";
applyVercelEnvironmentDefaults();

// Loading adapters only on first I/O avoids a schema -> env -> schema cycle.
function lazyBinding(load: () => Promise<object>): object {
  return new Proxy(
    {},
    {
      get(_target, method) {
        return async (...args: unknown[]): Promise<unknown> => {
          const binding = await load();
          const fn: unknown = Reflect.get(binding, method);
          if (typeof fn !== "function")
            throw new Error(`Unsupported binding method: ${String(method)}`);
          const result: unknown = Reflect.apply(fn, binding, args);
          return result;
        };
      },
    },
  );
}

const bindings: Record<string, unknown> = {
  AUTH_MODE: "password",
  RUNTIME_PLATFORM: "vercel",
  DATABASE_PROVIDER: "postgres",
  OPENSEO_TELEMETRY_DISABLED: "true",
  DO_NOT_TRACK: "1",
  KV: lazyBinding(async () =>
    (await import("./storage/kv")).createPostgresKv(),
  ),
  OAUTH_KV: lazyBinding(async () =>
    (await import("./storage/kv")).createPostgresKv("oauth"),
  ),
  R2: lazyBinding(async () =>
    (await import("./storage/blob")).createVercelBlobBucket(),
  ),
  AUDIT_SCRATCHPAD: {
    idFromName: (name: string) => name,
    get: (id: { toString(): string }) =>
      lazyBinding(async () =>
        (await import("./workflows")).createScratchpadBinding().get(id),
      ),
  },
  AUDIT_ENGINE: {
    async destroyScratchpad(id: string) {
      const { getAuditScratchpad } =
        await import("@/server/features/audit/AuditScratchpad");
      return getAuditScratchpad(id).destroy();
    },
  },
};
for (const [key, kind] of Object.entries({
  SITE_AUDIT_WORKFLOW: "site-audit",
  RANK_CHECK_WORKFLOW: "rank-check",
  AI_VISIBILITY_WORKFLOW: "ai-visibility",
  LOCAL_RANK_WORKFLOW: "local-rank",
} as const)) {
  bindings[key] = lazyBinding(async () =>
    (await import("./workflows")).createWorkflowBinding(kind),
  );
}

// One compatibility boundary: callers retain upstream Cloudflare binding types;
// each operation is implemented by a persistent Node adapter, never a fake DB.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime binding adapters preserve the methods used by this application
const workerEnvProxy = new Proxy(bindings, {
  get(target, key): unknown {
    return (
      Reflect.get(target, key) ??
      (typeof key === "string" ? process.env[key] : undefined)
    );
  },
}) as unknown as Env;
export { workerEnvProxy as env };

export function waitUntil(promise: Promise<unknown>): void {
  vercelWaitUntil(promise);
}

// The OAuth library uses WorkerEntrypoint for class-handler detection only.
export class WorkerEntrypoint<E = unknown> {
  constructor(
    protected ctx: unknown,
    protected env: E,
  ) {}
}
export class WorkflowEntrypoint<
  E = unknown,
  P = unknown,
> extends WorkerEntrypoint<E> {
  declare readonly __payloadType?: P;
}
// The original scratchpad class can be imported, but must never run on Node.
export class DurableObject<E = unknown> extends WorkerEntrypoint<E> {
  constructor(ctx: unknown, env: E) {
    super(ctx, env);
    throw new Error(
      "Durable Objects are unavailable; use the PostgreSQL adapter.",
    );
  }
}
