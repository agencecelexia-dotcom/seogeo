import type { BetterAuthOptions } from "better-auth";
import { z } from "zod";
import { checkKey } from "./encoding";
import { withStorageRepository } from "./storage-context";

type AuthRateStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;
const ruleSchema = z.object({
  window: z.number().int().positive().max(86_400),
  max: z.number().int().positive().max(1_000_000),
});
const snapshotSchema = z.object({
  count: z.number().int().nonnegative(),
  lastRequest: z.number().int().nonnegative(),
});

/** Shared across Vercel instances. An atomic SQL upsert enforces Better Auth's
 * rolling inactivity window even when many sign-in requests arrive together. */
export function createPostgresAuthRateLimitStorage(): AuthRateStorage & {
  consume: NonNullable<AuthRateStorage["consume"]>;
} {
  return {
    async get(key) {
      checkKey(key, 512);
      const row = await withStorageRepository((repository) =>
        repository.getKv("auth-rate", key, new Date().toISOString()),
      );
      return row
        ? {
            key,
            count: Number(row.value),
            lastRequest: Date.parse(row.updatedAt),
          }
        : null;
    },
    async set(key, value) {
      checkKey(key, 512);
      const data = snapshotSchema.parse(value);
      // Required compatibility API; current Better Auth uses atomic consume.
      // Retain legacy snapshots for the longest supported rule window.
      await withStorageRepository((repository) =>
        repository.putKv({
          namespace: "auth-rate",
          key,
          value: String(data.count),
          updatedAt: new Date(data.lastRequest).toISOString(),
          expiresAt: new Date(data.lastRequest + 86_400_000).toISOString(),
        }),
      );
    },
    async consume(key, input) {
      checkKey(key, 512);
      const rule = ruleSchema.parse(input);
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      return withStorageRepository(async (repository) => {
        const allowed = await repository.consumeAuthLimit({
          key,
          max: rule.max,
          now: nowIso,
          expiresAt: new Date(now + rule.window * 1000).toISOString(),
        });
        if (allowed) return { allowed: true, retryAfter: null };
        const row = await repository.getKv("auth-rate", key, nowIso);
        return {
          allowed: false,
          retryAfter: row?.expiresAt
            ? Math.max(1, Math.ceil((Date.parse(row.expiresAt) - now) / 1000))
            : rule.window,
        };
      });
    },
  };
}
