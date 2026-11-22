/* eslint-disable no-restricted-imports -- Vercel scratchpad is a Postgres infrastructure adapter. */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withPgClient } from "@/db";
import { pgDb } from "@/db/pg/client";
import type {
  AuditScratchpad,
  ClaimedUrl,
  FrontierStats,
} from "@/server/features/audit/AuditScratchpad";
import type { CrawlThrottleState } from "@/server/lib/audit/crawl-throttle";

type Tx = Parameters<Parameters<typeof pgDb.transaction>[0]>[0];
type Batch = Parameters<AuditScratchpad["recordBatch"]>[0];
const MAX_EDGES = 250000;
const throttleSchema = z.object({
  intervalMs: z.number(),
  nextRequestAt: z.number(),
  pausedUntil: z.number(),
  refusals: z.record(z.string(), z.number()),
  givenUpRun: z.number(),
  served: z.number(),
  cooldownMs: z.number(),
});
const mapClaimed = (
  rows: { url: string; depth: number | null; in_sitemap: number }[],
): ClaimedUrl[] =>
  rows.map((row) => ({
    url: row.url,
    depth: row.depth,
    inSitemap: row.in_sitemap === 1,
  }));

async function stats(tx: Tx, auditId: string): Promise<FrontierStats> {
  const rows = await tx.execute<{
    attempted: number;
    pending: number;
    seen: number;
  }>(sql`SELECT count(*) FILTER (WHERE state='crawled')::integer AS attempted,
    count(*) FILTER (WHERE state='pending')::integer AS pending,count(*)::integer AS seen FROM vercel_audit_frontier WHERE audit_id=${auditId}`);
  return rows[0];
}
async function writeRows(tx: Tx, prefix: SQL, rows: SQL[], suffix: SQL) {
  for (let offset = 0; offset < rows.length; offset += 300)
    await tx.execute(
      sql`${prefix} ${sql.join(rows.slice(offset, offset + 300), sql`, `)} ${suffix}`,
    );
}

/** One transaction lock per audit preserves the Durable Object's serialized RPC
 * semantics without keeping state or crawl queues in the Vercel process. */
export class PostgresAuditScratchpad {
  constructor(private readonly auditId: string) {}
  private async transaction<T>(callback: (tx: Tx) => Promise<T>) {
    return withPgClient(() =>
      pgDb.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.auditId},0))`,
        );
        await tx.execute(
          sql`INSERT INTO vercel_audit_scratchpads(audit_id,expires_at) VALUES (${this.auditId},${new Date(Date.now() + 7 * 86400000).toISOString()}) ON CONFLICT(audit_id) DO NOTHING`,
        );
        return callback(tx);
      }),
    );
  }
  async seedStart(url: string) {
    await this.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO vercel_audit_frontier(audit_id,url,depth,source,in_sitemap,state,queue_order)
        VALUES (${this.auditId},${url},0,'link',0,'pending',0) ON CONFLICT(audit_id,url) DO NOTHING`);
    });
  }
  async getCrawlThrottle(): Promise<CrawlThrottleState | undefined> {
    return this.transaction(async (tx) => {
      const rows = await tx.execute<{ throttle_text: string | null }>(
        sql`SELECT throttle_text FROM vercel_audit_scratchpads WHERE audit_id=${this.auditId}`,
      );
      return rows[0]?.throttle_text
        ? throttleSchema.parse(JSON.parse(rows[0].throttle_text))
        : undefined;
    });
  }
  async saveCrawlThrottle(state: CrawlThrottleState) {
    await this.transaction(async (tx) => {
      await tx.execute(
        sql`UPDATE vercel_audit_scratchpads SET throttle_text=${JSON.stringify(throttleSchema.parse(state))} WHERE audit_id=${this.auditId}`,
      );
    });
  }
  async seedSitemapUrls(urls: string[]) {
    await this.transaction(async (tx) => {
      const rows = await tx.execute<{ last: number }>(
        sql`SELECT coalesce(max(queue_order),0)::integer AS last FROM vercel_audit_frontier WHERE audit_id=${this.auditId}`,
      );
      await writeRows(
        tx,
        sql`INSERT INTO vercel_audit_frontier(audit_id,url,depth,source,in_sitemap,state,queue_order) VALUES`,
        [...new Set(urls)].map(
          (url, index) =>
            sql`(${this.auditId},${url},NULL,'sitemap',1,'pending',${rows[0].last + index + 1})`,
        ),
        sql`ON CONFLICT(audit_id,url) DO UPDATE SET in_sitemap=1`,
      );
    });
  }
  async claimChunk(chunkNo: number, limit: number, pagesLeft: number) {
    return this.transaction(async (tx) => {
      const existing = await tx.execute<{
        url: string;
        depth: number | null;
        in_sitemap: number;
      }>(
        sql`SELECT url,depth,in_sitemap FROM vercel_audit_frontier WHERE audit_id=${this.auditId} AND state='leased' AND chunk_no=${chunkNo} ORDER BY queue_order`,
      );
      if (existing.length) return { urls: mapClaimed(existing), isRetry: true };
      const done = await tx.execute(
        sql`SELECT url FROM vercel_audit_frontier WHERE audit_id=${this.auditId} AND chunk_no=${chunkNo} AND state='crawled' LIMIT 1`,
      );
      if (done.length) return { urls: [], isRetry: true };
      if (limit <= 0 || pagesLeft <= 0) return { urls: [], isRetry: false };
      const effectiveLimit = Math.min(limit, pagesLeft);
      const fresh = await tx.execute<{
        url: string;
        depth: number | null;
        in_sitemap: number;
      }>(sql`SELECT url,depth,in_sitemap FROM vercel_audit_frontier WHERE audit_id=${this.auditId} AND state='pending'
        AND (in_sitemap=1 OR depth=0 OR (SELECT count(*) FROM vercel_audit_frontier WHERE audit_id=${this.auditId} AND state='pending' AND in_sitemap=1)<=${pagesLeft - effectiveLimit})
        ORDER BY CASE source WHEN 'link' THEN 0 ELSE 1 END,queue_order LIMIT ${effectiveLimit}`);
      if (fresh.length)
        await tx.execute(
          sql`UPDATE vercel_audit_frontier SET state='leased',chunk_no=${chunkNo} WHERE audit_id=${this.auditId} AND url IN (${sql.join(
            fresh.map((row) => sql`${row.url}`),
            sql`, `,
          )})`,
        );
      return { urls: mapClaimed(fresh), isRetry: false };
    });
  }
  async recordBatch(input: Batch) {
    return this.transaction(async (tx) => {
      if (input.crawledUrls.length)
        await tx.execute(
          sql`UPDATE vercel_audit_frontier SET state='crawled' WHERE audit_id=${this.auditId} AND url IN (${sql.join(
            input.crawledUrls.map((url) => sql`${url}`),
            sql`, `,
          )})`,
        );
      await writeRows(
        tx,
        sql`INSERT INTO vercel_audit_pages(audit_id,page_id,url,status_code,fetch_class,redirect_url) VALUES`,
        input.pages.map(
          (page) =>
            sql`(${this.auditId},${page.pageId},${page.url},${page.statusCode},${page.fetchClass},${page.redirectUrl})`,
        ),
        sql`ON CONFLICT(audit_id,page_id) DO UPDATE SET url=EXCLUDED.url,status_code=EXCLUDED.status_code,fetch_class=EXCLUDED.fetch_class,redirect_url=EXCLUDED.redirect_url`,
      );
      await this.recordLinks(tx, input);
      const rows = await tx.execute<{ last: number }>(
        sql`SELECT coalesce(max(queue_order),0)::integer AS last FROM vercel_audit_frontier WHERE audit_id=${this.auditId}`,
      );
      await writeRows(
        tx,
        sql`INSERT INTO vercel_audit_frontier(audit_id,url,depth,source,in_sitemap,state,queue_order) VALUES`,
        input.discovered.map(
          (found, index) =>
            sql`(${this.auditId},${found.url},${found.depth},'link',0,'pending',${rows[0].last + index + 1})`,
        ),
        sql`ON CONFLICT(audit_id,url) DO UPDATE SET source='link',depth=EXCLUDED.depth WHERE vercel_audit_frontier.state='pending' AND vercel_audit_frontier.depth IS NULL AND EXCLUDED.depth IS NOT NULL`,
      );
      return stats(tx, this.auditId);
    });
  }
  private async recordLinks(tx: Tx, input: Batch) {
    if (!input.links.length) return;
    await tx.execute(
      sql`DELETE FROM vercel_audit_edges WHERE audit_id=${this.auditId} AND source_page_id IN (${sql.join(
        input.links.map((row) => sql`${row.pageId}`),
        sql`, `,
      )})`,
    );
    const rows = await tx.execute<{ count: number }>(
      sql`SELECT count(*)::integer AS count FROM vercel_audit_edges WHERE audit_id=${this.auditId}`,
    );
    let remaining = Math.max(0, MAX_EDGES - rows[0].count);
    let truncated = false;
    for (const page of input.links) {
      const targets = [...new Set(page.targets)];
      if (targets.length > remaining) truncated = true;
      const kept = targets.slice(0, remaining);
      await writeRows(
        tx,
        sql`INSERT INTO vercel_audit_edges(audit_id,source_page_id,source_url,target_url) VALUES`,
        kept.map(
          (target) =>
            sql`(${this.auditId},${page.pageId},${page.url},${target})`,
        ),
        sql`ON CONFLICT DO NOTHING`,
      );
      remaining -= kept.length;
    }
    await tx.execute(
      sql`UPDATE vercel_audit_scratchpads SET edge_count=${MAX_EDGES - remaining},graph_complete=CASE WHEN ${truncated} THEN 0 ELSE graph_complete END WHERE audit_id=${this.auditId}`,
    );
  }
  async releaseUrls(urls: string[]) {
    if (!urls.length) return;
    await this.transaction(async (tx) => {
      await tx.execute(
        sql`UPDATE vercel_audit_frontier SET state='pending',chunk_no=NULL WHERE audit_id=${this.auditId} AND state='leased' AND url IN (${sql.join(
          urls.map((url) => sql`${url}`),
          sql`, `,
        )})`,
      );
    });
  }
  async getStats() {
    return this.transaction((tx) => stats(tx, this.auditId));
  }
  async runFinalizeChecks(input: {
    startUrl: string;
    crawlCompleted: boolean;
  }) {
    return this.transaction(async (tx) => {
      const brokenLinks = await tx.execute<{
        sourcePageId: string;
        sourceUrl: string;
        targetUrl: string;
        targetStatus: number;
      }>(sql`SELECT e.source_page_id AS "sourcePageId",e.source_url AS "sourceUrl",e.target_url AS "targetUrl",p.status_code AS "targetStatus"
        FROM vercel_audit_edges e JOIN vercel_audit_pages p ON p.audit_id=e.audit_id AND p.url=e.target_url WHERE e.audit_id=${this.auditId} AND p.status_code>=400 AND p.fetch_class='ok'
        ORDER BY e.source_page_id,e.target_url LIMIT 2000`);
      const rows = await tx.execute<{ graph_complete: number }>(
        sql`SELECT graph_complete FROM vercel_audit_scratchpads WHERE audit_id=${this.auditId}`,
      );
      const orphanPages =
        input.crawlCompleted && rows[0].graph_complete === 1
          ? await tx.execute<{
              pageId: string;
              url: string;
            }>(sql`SELECT p.page_id AS "pageId",p.url FROM vercel_audit_pages p WHERE p.audit_id=${this.auditId} AND p.url<>${input.startUrl} AND p.fetch_class='ok' AND p.status_code>=200 AND p.status_code<300
          AND NOT EXISTS (SELECT 1 FROM vercel_audit_edges e WHERE e.audit_id=p.audit_id AND e.target_url=p.url AND e.source_url<>e.target_url)
          AND NOT EXISTS (SELECT 1 FROM vercel_audit_pages r WHERE r.audit_id=p.audit_id AND r.redirect_url=p.url)`)
          : [];
      return { brokenLinks: [...brokenLinks], orphanPages: [...orphanPages] };
    });
  }
  async destroy() {
    await withPgClient(async () => {
      await pgDb.execute(
        sql`DELETE FROM vercel_audit_scratchpads WHERE audit_id=${this.auditId}`,
      );
    });
  }
  async destroyForErasure() {
    await this.destroy();
  }
}
