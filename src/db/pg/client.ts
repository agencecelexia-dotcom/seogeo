/* oxlint-disable typescript/no-unsafe-return, typescript/no-unsafe-type-assertion -- The proxy resolves the request-scoped Postgres client from AsyncLocalStorage. */
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import {
  getDatabaseProvider,
  getPostgresConnectionString,
  isVercelDatabaseRuntime,
} from "@/db/provider";
import { keepPostgresPoolAlive } from "@/server/vercel/storage/postgres-lifecycle";
import { withQueryRetries } from "./retry";
import * as schema from "./schema";

// Vercel reuses a small pool across warm invocations. Postgres on Cloudflare
// Workers requires a PER-REQUEST client: the runtime
// forbids using a socket created by one request from a different request
// ("Cannot perform I/O on behalf of a different request"), and Hyperdrive does
// not lift that — its docs are explicit that the client must be created inside
// the handler, never in global scope. So we keep the active client in
// AsyncLocalStorage, seeded by `withPgClient` at each entrypoint. In D1 mode
// (the default) none of this runs.
type Sql = ReturnType<typeof postgres>;

function createPgDb(sql: Sql) {
  return drizzle(sql, { schema });
}

type ClientStore = {
  sql: Sql;
  db: ReturnType<typeof createPgDb>;
  lifecyclePool?: Sql;
};
const pgClientStore = new AsyncLocalStorage<ClientStore>();
let vercelStore: ClientStore | undefined;

function getVercelStore(): ClientStore {
  if (!vercelStore) {
    // Local PGlite's wire-protocol server needs one connection; production
    // keeps a small pool. Reject invalid sizes rather than silently widening it.
    const config = z
      .object({
        POSTGRES_POOL_MAX: z.coerce.number().int().min(1).max(3).default(3),
      })
      .parse({
        POSTGRES_POOL_MAX: process.env.POSTGRES_POOL_MAX?.trim() || undefined,
      });
    const raw = postgres(getPostgresConnectionString(), {
      max: config.POSTGRES_POOL_MAX,
      fetch_types: false,
      prepare: false,
      idle_timeout: 5,
      max_lifetime: 60,
      connect_timeout: 10,
    });
    const sql = withQueryRetries(raw, () => keepPostgresPoolAlive(raw));
    vercelStore = { sql, db: createPgDb(sql), lifecyclePool: raw };
  }
  return vercelStore;
}

export const pgDb = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const store = pgClientStore.getStore();
      if (!store) {
        throw new Error(
          "Postgres database accessed outside a request scope. Entrypoints " +
            "(fetch, scheduled, workflow run) must wrap DB usage in withPgClient().",
        );
      }
      return Reflect.get(store.db, prop, receiver);
    },
  },
) as ReturnType<typeof createPgDb>;

/**
 * Run `fn` with a request-scoped Postgres client in scope.
 *
 * - D1 mode (default): a no-op — just runs `fn` (no Postgres client created).
 * - Vercel Postgres: scopes the warm pool and allows its idle timeout to finish.
 * - Workers Postgres: creates a fresh per-request client and makes it the active
 *   `pgDb` for the duration of `fn`.
 *
 * Wrap every entrypoint that touches the DB: the `fetch` handler, the
 * `scheduled` cron, and each WorkflowEntrypoint `run`.
 *
 * Per Hyperdrive's guidance we use a single connection (`max: 1` — Hyperdrive
 * pools the origin connections at the edge, so a client-side pool only adds
 * stale-connection risk) and do NOT call `sql.end()`: the Workers↔Hyperdrive
 * socket is torn down automatically when the invocation ends, and the pooled
 * origin connection stays warm for reuse. Not ending it also means a streamed
 * response can keep querying after the handler returns.
 */
export async function withPgClient<T>(fn: () => Promise<T>): Promise<T> {
  if (getDatabaseProvider() !== "postgres") {
    return fn();
  }
  // Reentrant: nested scopes (e.g. a DO hook calling helpers that defensively
  // scope themselves) reuse the ambient client instead of opening another
  // connection. Workflow steps are unaffected — ALS never crosses step.do, so
  // each step's own wrap still creates its client.
  if (pgClientStore.getStore()) {
    return fn();
  }
  if (isVercelDatabaseRuntime()) {
    const store = getVercelStore();
    try {
      return await pgClientStore.run(store, fn);
    } finally {
      keepPostgresPoolAlive(store.lifecyclePool ?? store.sql);
    }
  }
  const sql = withQueryRetries(
    postgres(getPostgresConnectionString(), {
      max: 1,
      fetch_types: false,
      // Bound connect stalls (seconds) so the per-query retry in
      // withQueryRetries gets its turn within the request's lifetime instead
      // of hanging on postgres.js's 30s default during a failover.
      connect_timeout: 10,
    }),
  );
  return pgClientStore.run({ sql, db: createPgDb(sql) }, fn);
}
