import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  importBatches,
  importedBacklinks,
  importedGeoMetrics,
} from "@/db/schema";
import type { ImportInput, ImportRow } from "@/shared/data-imports";

async function findBatch(
  projectId: string,
  fingerprint: string,
): Promise<typeof importBatches.$inferSelect | null> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.projectId, projectId),
        eq(importBatches.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  return batch ?? null;
}

async function list(projectId: string) {
  const [batches, geo, backlinks] = await Promise.all([
    db
      .select()
      .from(importBatches)
      .where(eq(importBatches.projectId, projectId))
      .orderBy(desc(importBatches.createdAt))
      .limit(30),
    db
      .select()
      .from(importedGeoMetrics)
      .where(eq(importedGeoMetrics.projectId, projectId))
      .orderBy(
        desc(importedGeoMetrics.importedAt),
        desc(importedGeoMetrics.periodEnd),
      )
      .limit(200),
    db
      .select()
      .from(importedBacklinks)
      .where(eq(importedBacklinks.projectId, projectId))
      .orderBy(desc(importedBacklinks.importedAt))
      .limit(200),
  ]);
  return { batches, geo, backlinks };
}

async function insert(
  input: ImportInput,
  rows: ImportRow[],
  fingerprint: string,
  userId: string,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // The batch and all its rows commit together. A parse/SQL error cannot leave
  // an apparently successful partial import, on either database provider.
  await runBatch((tx) => [
    tx.insert(importBatches).values({
      id,
      projectId: input.projectId,
      source: input.source,
      fileName: input.fileName,
      fingerprint,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      rowCount: rows.length,
      status: "complete",
      createdByUserId: userId,
      createdAt: now,
      completedAt: now,
    }),
    ...rows.map((row) => {
      if (row.kind === "backlink") {
        const values = {
          id: crypto.randomUUID(),
          projectId: input.projectId,
          batchId: id,
          rowKey: row.rowKey,
          sourceUrl: row.sourceUrl,
          targetUrl: row.targetUrl,
          anchor: row.anchor,
          rel: row.rel,
          firstSeen: row.firstSeen,
          lastSeen: row.lastSeen,
          importedAt: now,
        };
        return tx
          .insert(importedBacklinks)
          .values(values)
          .onConflictDoUpdate({
            target: [importedBacklinks.projectId, importedBacklinks.rowKey],
            set: {
              batchId: id,
              anchor: row.anchor,
              rel: row.rel,
              firstSeen: row.firstSeen,
              lastSeen: row.lastSeen,
              importedAt: now,
            },
          });
      }
      const values = {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        batchId: id,
        source:
          input.source === "gsc_generative"
            ? ("gsc_generative" as const)
            : ("bing_ai" as const),
        rowKey: row.rowKey,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        pageUrl: row.pageUrl,
        query: row.query,
        country: row.country,
        device: row.device,
        metric: row.metric,
        value: row.value,
        importedAt: now,
      };
      return tx
        .insert(importedGeoMetrics)
        .values(values)
        .onConflictDoUpdate({
          target: [
            importedGeoMetrics.projectId,
            importedGeoMetrics.source,
            importedGeoMetrics.rowKey,
          ],
          set: { batchId: id, value: row.value, importedAt: now },
        });
    }),
  ]);
  return { id, rowCount: rows.length };
}

export const ImportRepository = { findBatch, list, insert };
