/* eslint-disable no-restricted-imports -- This file is the PostgreSQL-only Vercel cron lease adapter. */
import { timingSafeEqual } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { pgDb } from "@/db/pg/client";
import { runtimeKvEntries } from "@/db/pg/vercel-runtime.schema";
import { env } from "./workers";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.method !== "GET") return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

export async function handleCronRequest(
  request: Request,
  kind: "schedule" | "workflows" = "schedule",
): Promise<Response> {
  if (!authorized(request))
    return new Response("Unauthorized", { status: 401 });
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 780_000).toISOString();
  const lease = await pgDb
    .insert(runtimeKvEntries)
    .values({
      namespace: "cron",
      key: kind,
      value: token,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [runtimeKvEntries.namespace, runtimeKvEntries.key],
      set: { value: token, expiresAt, updatedAt: now },
      setWhere: lte(runtimeKvEntries.expiresAt, now),
    })
    .returning({ key: runtimeKvEntries.key });
  if (!lease.length) return Response.json({ status: "already-running" });
  const errors: string[] = [];
  try {
    if (kind === "workflows") {
      const workflows = await (
        await import("./workflows")
      ).runDueWorkflows({ budgetMs: 650_000 });
      return Response.json({ status: "ok", workflows });
    }
    // Each scheduler already has per-source / per-project CAS guards. One
    // failed provider must not prevent unrelated projects from progressing.
    const schedulers = [
      async () =>
        (
          await import("@/server/features/audit/services/auditReconciler")
        ).reconcileStaleAudits(),
      async () =>
        (
          await import("@/server/features/rank-tracking/services/scheduledRankChecks")
        ).runScheduledRankChecks(env),
      async () =>
        (
          await import("@/server/features/ai-visibility/services/scheduledAiVisibility")
        ).runScheduledAiVisibility(),
      async () =>
        (
          await import("@/server/features/monitoring/MonitoringService")
        ).MonitoringService.runScheduled(),
      async () =>
        (
          await import("@/server/features/audit-schedule/AuditScheduleService")
        ).AuditScheduleService.runDue(),
      async () =>
        (
          await import("@/server/features/workbench/WorkbenchDiscoveryService")
        ).WorkbenchDiscoveryService.runDue(),
      async () => (await import("./storage/maintenance")).pruneVercelStorage(),
      async () => (await import("./workflows")).maintainWorkflowStorage(),
    ];
    const results = await Promise.allSettled(schedulers.map((run) => run()));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`[cron] scheduler ${index} failed`, result.reason);
        errors.push(`scheduler-${index}`);
      }
    });
    return Response.json(
      { status: errors.length ? "partial" : "ok", errors },
      { status: errors.length ? 500 : 200 },
    );
  } finally {
    await pgDb
      .delete(runtimeKvEntries)
      .where(
        and(
          eq(runtimeKvEntries.namespace, "cron"),
          eq(runtimeKvEntries.key, kind),
          eq(runtimeKvEntries.value, token),
        ),
      );
  }
}
