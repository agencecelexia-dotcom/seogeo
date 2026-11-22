import { del } from "@vercel/blob";
import { withStorageRepository } from "./storage-context";

/** One bounded sweep per scheduled invocation; unsuccessful deletes stay queued. */
export async function pruneVercelStorage() {
  const now = new Date().toISOString();
  const kvDeleted = await withStorageRepository((repository) =>
    repository.pruneExpiredKv(now),
  );
  await withStorageRepository((repository) =>
    repository.pruneExpiredBlobs(now),
  );
  const pending = await withStorageRepository((repository) =>
    repository.pendingBlobDeletions(100),
  );
  if (!pending.length) return { kvDeleted, blobsDeleted: 0 };
  const urls = pending.map((row) => row.blobUrl);
  await del(urls, { abortSignal: AbortSignal.timeout(60_000) });
  await withStorageRepository((repository) =>
    repository.completeBlobDeletions(urls),
  );
  return { kvDeleted, blobsDeleted: urls.length };
}
