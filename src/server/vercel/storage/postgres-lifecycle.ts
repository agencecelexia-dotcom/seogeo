import { waitUntil } from "@vercel/functions";

const IDLE_TIMEOUT_MS = 5_000;
const pending = new WeakMap<
  object,
  { timer: ReturnType<typeof setTimeout>; resolve: () => void }
>();

/** postgres.js has no pool release events for attachDatabasePool. Notify after
 * each query/transaction instead, keeping Fluid Compute alive through its idle timeout. */
export function keepPostgresPoolAlive(pool: object) {
  if (!process.env.VERCEL_URL || !process.env.VERCEL_REGION) return;
  const previous = pending.get(pool);
  if (previous) {
    clearTimeout(previous.timer);
    previous.resolve();
  }
  const promise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(pool);
      resolve();
    }, IDLE_TIMEOUT_MS + 100);
    pending.set(pool, { timer, resolve });
  });
  waitUntil(promise);
}
