import type { StorageRepository } from "./StorageRepository";
import type * as storageModule from "./StorageRepository";
import type * as databaseModule from "@/db";

let modules: Promise<[typeof storageModule, typeof databaseModule]> | undefined;

// The env bridge constructs adapters before DB modules initialize. Keep the
// dependency lazy and establish a PG scope for OAuth/cache callbacks as well.
export async function withStorageRepository<T>(
  work: (repository: typeof StorageRepository) => Promise<T>,
): Promise<T> {
  modules ??= Promise.all([import("./StorageRepository"), import("@/db")]);
  const [{ StorageRepository: repository }, { withPgClient }] = await modules;
  return withPgClient(() => work(repository));
}
