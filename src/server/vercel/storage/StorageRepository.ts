import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  runtimeKvEntries,
  runtimeBlobObjects,
  runtimeBlobDeletions,
} from "@/db/schema";

type KvEntry = typeof runtimeKvEntries.$inferInsert;
type BlobEntry = typeof runtimeBlobObjects.$inferInsert;
const unexpired = (now: string) =>
  or(isNull(runtimeKvEntries.expiresAt), gt(runtimeKvEntries.expiresAt, now));
function prefixMatch(column: AnyColumn, prefix: string) {
  const pattern = prefix.replace(/[\\%_]/g, "\\$&") + "%";
  return sql`${column} like ${pattern} escape '\\'`;
}
async function getKv(
  namespace: string,
  key: string,
  now: string,
): Promise<typeof runtimeKvEntries.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(runtimeKvEntries)
    .where(
      and(
        eq(runtimeKvEntries.namespace, namespace),
        eq(runtimeKvEntries.key, key),
        unexpired(now),
      ),
    );
  return row ?? null;
}
async function putKv(input: KvEntry) {
  await db
    .insert(runtimeKvEntries)
    .values(input)
    .onConflictDoUpdate({
      target: [runtimeKvEntries.namespace, runtimeKvEntries.key],
      set: input,
    });
}
async function consumeAuthLimit(input: {
  key: string;
  max: number;
  now: string;
  expiresAt: string;
}) {
  const expired = lte(runtimeKvEntries.expiresAt, input.now);
  const [accepted] = await db
    .insert(runtimeKvEntries)
    .values({
      namespace: "auth-rate",
      key: input.key,
      value: "1",
      updatedAt: input.now,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [runtimeKvEntries.namespace, runtimeKvEntries.key],
      set: {
        value: sql`case when ${expired} then '1' else cast(cast(${runtimeKvEntries.value} as integer) + 1 as text) end`,
        updatedAt: input.now,
        expiresAt: input.expiresAt,
      },
      setWhere: or(
        expired,
        sql`cast(${runtimeKvEntries.value} as integer) < ${input.max}`,
      ),
    })
    .returning({ key: runtimeKvEntries.key });
  return Boolean(accepted);
}
async function deleteKv(namespace: string, key: string) {
  await db
    .delete(runtimeKvEntries)
    .where(
      and(
        eq(runtimeKvEntries.namespace, namespace),
        eq(runtimeKvEntries.key, key),
      ),
    );
}
async function listKv(input: {
  namespace: string;
  prefix: string;
  after: string;
  limit: number;
  now: string;
}) {
  return db
    .select()
    .from(runtimeKvEntries)
    .where(
      and(
        eq(runtimeKvEntries.namespace, input.namespace),
        prefixMatch(runtimeKvEntries.key, input.prefix),
        gt(runtimeKvEntries.key, input.after),
        unexpired(input.now),
      ),
    )
    .orderBy(asc(runtimeKvEntries.key))
    .limit(input.limit + 1);
}
async function getBlob(
  key: string,
): Promise<typeof runtimeBlobObjects.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(runtimeBlobObjects)
    .where(eq(runtimeBlobObjects.key, key));
  return row ?? null;
}
async function publishBlob(input: BlobEntry) {
  await runBatch((tx) => [
    // The insert also serializes simultaneous first writes of the same key.
    tx.insert(runtimeBlobObjects).values(input).onConflictDoNothing(),
    tx
      .update(runtimeBlobObjects)
      .set({ key: sql`${runtimeBlobObjects.key}` })
      .where(eq(runtimeBlobObjects.key, input.key)),
    tx
      .insert(runtimeBlobDeletions)
      .select(
        tx
          .select({
            blobUrl: runtimeBlobObjects.blobUrl,
            queuedAt: sql`${new Date().toISOString()}`.as("queued_at"),
          })
          .from(runtimeBlobObjects)
          .where(
            and(
              eq(runtimeBlobObjects.key, input.key),
              ne(runtimeBlobObjects.blobUrl, input.blobUrl),
            ),
          ),
      )
      .onConflictDoNothing(),
    tx
      .update(runtimeBlobObjects)
      .set(input)
      .where(eq(runtimeBlobObjects.key, input.key)),
  ]);
}
async function deleteBlobs(keys: string[]) {
  if (!keys.length) return;
  await runBatch((tx) => [
    tx
      .update(runtimeBlobObjects)
      .set({ key: sql`${runtimeBlobObjects.key}` })
      .where(inArray(runtimeBlobObjects.key, keys)),
    tx
      .insert(runtimeBlobDeletions)
      .select(
        tx
          .select({
            blobUrl: runtimeBlobObjects.blobUrl,
            queuedAt: sql`${new Date().toISOString()}`.as("queued_at"),
          })
          .from(runtimeBlobObjects)
          .where(inArray(runtimeBlobObjects.key, keys)),
      )
      .onConflictDoNothing(),
    tx.delete(runtimeBlobObjects).where(inArray(runtimeBlobObjects.key, keys)),
  ]);
}
async function listBlobs(input: {
  prefix: string;
  after: string;
  limit: number;
}) {
  return db
    .select()
    .from(runtimeBlobObjects)
    .where(
      and(
        prefixMatch(runtimeBlobObjects.key, input.prefix),
        gt(runtimeBlobObjects.key, input.after),
      ),
    )
    .orderBy(asc(runtimeBlobObjects.key))
    .limit(input.limit + 1);
}
async function pendingBlobDeletions(limit: number) {
  return db
    .select()
    .from(runtimeBlobDeletions)
    .where(
      sql`not ${exists(db.select({ key: runtimeBlobObjects.key }).from(runtimeBlobObjects).where(eq(runtimeBlobObjects.blobUrl, runtimeBlobDeletions.blobUrl)))}`,
    )
    .orderBy(asc(runtimeBlobDeletions.queuedAt))
    .limit(limit);
}
async function completeBlobDeletions(urls: string[]) {
  if (urls.length)
    await db
      .delete(runtimeBlobDeletions)
      .where(inArray(runtimeBlobDeletions.blobUrl, urls));
}
async function pruneExpiredBlobs(now: string) {
  const rows = await db
    .select({ key: runtimeBlobObjects.key })
    .from(runtimeBlobObjects)
    .where(lte(runtimeBlobObjects.expiresAt, now))
    .limit(50);
  for (const { key } of rows) {
    await runBatch((tx) => [
      tx
        .update(runtimeBlobObjects)
        .set({ key: sql`${runtimeBlobObjects.key}` })
        .where(
          and(
            eq(runtimeBlobObjects.key, key),
            lte(runtimeBlobObjects.expiresAt, now),
          ),
        ),
      tx
        .insert(runtimeBlobDeletions)
        .select(
          tx
            .select({
              blobUrl: runtimeBlobObjects.blobUrl,
              queuedAt: sql`${now}`.as("queued_at"),
            })
            .from(runtimeBlobObjects)
            .where(
              and(
                eq(runtimeBlobObjects.key, key),
                lte(runtimeBlobObjects.expiresAt, now),
              ),
            ),
        )
        .onConflictDoNothing(),
      tx
        .delete(runtimeBlobObjects)
        .where(
          and(
            eq(runtimeBlobObjects.key, key),
            lte(runtimeBlobObjects.expiresAt, now),
          ),
        ),
    ]);
  }
}
async function pruneExpiredKv(now: string) {
  const rows = await db
    .select({
      namespace: runtimeKvEntries.namespace,
      key: runtimeKvEntries.key,
    })
    .from(runtimeKvEntries)
    .where(lte(runtimeKvEntries.expiresAt, now))
    .orderBy(asc(runtimeKvEntries.expiresAt))
    .limit(500);
  await runBatch((tx) =>
    rows.map((row) =>
      tx
        .delete(runtimeKvEntries)
        .where(
          and(
            eq(runtimeKvEntries.namespace, row.namespace),
            eq(runtimeKvEntries.key, row.key),
            lte(runtimeKvEntries.expiresAt, now),
          ),
        ),
    ),
  );
  return rows.length;
}
export const StorageRepository = {
  getKv,
  putKv,
  consumeAuthLimit,
  deleteKv,
  listKv,
  getBlob,
  publishBlob,
  deleteBlobs,
  listBlobs,
  pendingBlobDeletions,
  completeBlobDeletions,
  pruneExpiredBlobs,
  pruneExpiredKv,
};
