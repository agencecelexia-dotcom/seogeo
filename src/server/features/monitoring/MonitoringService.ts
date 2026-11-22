import { MonitoringRepository, type DailyMetric } from "./MonitoringRepository";
import { UsageBudgetService } from "./UsageBudgetService";
import { dateInZone, nextSyncDay, shiftDate } from "./syncDates";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { DataRefreshClaimRepository } from "@/server/features/dashboard/repositories/DataRefreshClaimRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscService } from "@/server/features/gsc/services/GscService";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { AppError } from "@/server/lib/errors";
import { GscApiError, GscTokenError } from "@/server/lib/gscErrors";
import { Ga4ReportError } from "@/server/lib/ga4Errors";

const MAX_DAILY_PAGES = 1000;
function errorCode(error: unknown) {
  if (error instanceof GscTokenError) return "reconnect_required";
  if (error instanceof GscApiError)
    return error.status === 429
      ? "quota_exhausted"
      : error.status === 401 || error.status === 403
        ? "connection_unavailable"
        : "provider_error";
  if (error instanceof Ga4ReportError) return error.code;
  return "collection_failed";
}
function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function landingUrl(row: Record<string, unknown>) {
  const path =
    typeof row.landingPage === "string" ? row.landingPage : "(not set)";
  const host = typeof row.hostName === "string" ? row.hostName : "";
  return host && !host.includes(" ") && path.startsWith("/")
    ? `https://${host}${path}`
    : `(not set):${host}:${path}`;
}

async function syncSource(
  projectId: string,
  organizationId: string,
  source: "gsc" | "ga4",
  backfillDays: number,
  now: Date,
) {
  const connection =
    source === "gsc"
      ? await GscConnectionRepository.getByProjectId(projectId)
      : await Ga4ConnectionRepository.getByProjectId(projectId);
  const timeZone =
    connection && "propertyTimeZone" in connection
      ? connection.propertyTimeZone
      : "America/Los_Angeles";
  const today = dateInZone(now, timeZone);
  const sourceProperty = connection
    ? "siteUrl" in connection
      ? connection.siteUrl
      : connection.propertyId
    : null;
  let state = await MonitoringRepository.sourceState(projectId, source);
  if (state && state.sourceProperty !== sourceProperty) {
    await MonitoringRepository.purgeSource(projectId, source);
    state = null;
  }
  const lagDays = source === "gsc" ? 3 : 1;
  const end = shiftDate(today, -lagDays);
  const newCycle = state?.refreshCycleDate !== today;
  const refreshedThrough = newCycle
    ? shiftDate(end, -7)
    : (state?.refreshedThrough ?? null);
  const next = nextSyncDay({
    today,
    lagDays,
    backfillDays,
    refreshedThrough,
    backfillBefore: state?.backfillBefore ?? null,
  });
  if (!next && connection) return "current" as const;
  const date = next?.date ?? end;
  const id = crypto.randomUUID();
  await MonitoringRepository.startRun({
    id,
    projectId,
    organizationId,
    source,
    status: connection ? "running" : "unconnected",
    startDate: date,
    endDate: date,
    sourceProperty,
    sourceTimeZone: timeZone,
    startedAt: now.toISOString(),
    finishedAt: connection ? null : now.toISOString(),
    errorCode: connection ? null : "not_connected",
  });
  if (!connection || !sourceProperty || !next) return "unavailable" as const;
  try {
    const base = {
      projectId,
      source,
      sourceProperty,
      sourceTimeZone: timeZone,
      date,
      fetchedAt: now.toISOString(),
    };
    let metrics: DailyMetric[] = [];
    let coverage = "complete";
    if (source === "gsc") {
      const common = {
        projectId,
        startDate: date,
        endDate: date,
        dataState: "final" as const,
      };
      const totals = await GscService.getPerformance({
        ...common,
        dimensions: [],
        rowLimit: 1,
      });
      const pages = await GscService.getPerformance({
        ...common,
        dimensions: ["page"],
        rowLimit: MAX_DAILY_PAGES + 1,
      });
      coverage =
        pages.rows.length > MAX_DAILY_PAGES
          ? "partial_row_limit"
          : "google_top_rows";
      metrics = [
        ...totals.rows.map((row) => ({
          ...base,
          id: crypto.randomUUID(),
          grain: "site",
          page: "",
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
        })),
        ...pages.rows.slice(0, MAX_DAILY_PAGES).map((row) => ({
          ...base,
          id: crypto.randomUUID(),
          grain: "page",
          page: row.keys?.[0] ?? "",
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
        })),
      ];
    } else {
      const report = await Ga4ReportingService.runReport({
        projectId,
        kind: "landing_pages",
        startDate: date,
        endDate: date,
        channel: "organic_search",
        limit: MAX_DAILY_PAGES,
      });
      coverage = report.pageInfo.hasMore
        ? "partial_row_limit"
        : report.reportMetadata.hasLimitedData
          ? "google_limited"
          : "complete";
      metrics = report.rows.map((row) => ({
        ...base,
        id: crypto.randomUUID(),
        grain: "landing",
        page: landingUrl(row),
        sessions: metricNumber(row.sessions),
        keyEvents: metricNumber(row.keyEvents),
        revenue: metricNumber(row.purchaseRevenue),
        currencyCode: report.request.currencyCode,
      }));
    }
    await MonitoringRepository.replaceDay(
      projectId,
      source,
      sourceProperty,
      date,
      { rows: metrics, connectionId: connection.id },
    );
    await MonitoringRepository.saveSourceState(
      {
        id: `${projectId}:${source}`,
        projectId,
        source,
        sourceProperty,
        refreshCycleDate: today,
        refreshedThrough: next.recent ? date : refreshedThrough,
        backfillBefore:
          !state?.backfillBefore || date < state.backfillBefore
            ? date
            : state.backfillBefore,
        updatedAt: now.toISOString(),
      },
      connection.id,
    );
    await MonitoringRepository.finishRun(id, {
      status: metrics.length ? "success" : "empty",
      rowCount: metrics.length,
      coverage,
      finishedAt: new Date().toISOString(),
    });
    return "synced" as const;
  } catch (error) {
    await MonitoringRepository.finishRun(id, {
      status: "error",
      errorCode: errorCode(error),
      coverage: "unknown",
      finishedAt: new Date().toISOString(),
    });
    return "unavailable" as const;
  }
}

async function syncProject(
  projectId: string,
  organizationId: string,
  now = new Date(),
) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  const settings = await MonitoringRepository.getSettings(
    projectId,
    organizationId,
  );
  if (!settings.enabled) return { status: "paused" as const };
  const key = `monitoring:${projectId}`;
  const token = await DataRefreshClaimRepository.claim(key, organizationId);
  if (!token) return { status: "running" as const };
  const results: Array<"synced" | "current" | "unavailable"> = [];
  try {
    // Serial: no cross-provider quota fan-out; one resumable day per source.
    for (const source of ["gsc", "ga4"] as const)
      results.push(
        await syncSource(
          projectId,
          organizationId,
          source,
          settings.backfillDays,
          now,
        ),
      );
    const progressed = results.includes("synced");
    const nextDay = new Date(now);
    nextDay.setUTCHours(24, 0, 0, 0);
    await MonitoringRepository.nextRun(
      projectId,
      process.env.RUNTIME_PLATFORM === "vercel"
        ? nextDay.toISOString()
        : new Date(
            now.getTime() + (progressed ? 5 * 60_000 : 24 * 60 * 60_000),
          ).toISOString(),
    );
    return {
      status: progressed
        ? ("synced" as const)
        : results.includes("current")
          ? ("current" as const)
          : ("unavailable" as const),
    };
  } finally {
    await DataRefreshClaimRepository.finish(key, token, 0);
  }
}

async function runScheduled(now = new Date()) {
  await MonitoringRepository.initializeProjects();
  const due = await MonitoringRepository.listDue(now.toISOString());
  if (process.env.RUNTIME_PLATFORM === "vercel") {
    const { createWorkflowBinding } = await import("@/server/vercel/workflows");
    const workflow = createWorkflowBinding<{
      projectId: string;
      organizationId: string;
    }>("monitoring-sync");
    const nextDay = new Date(now);
    nextDay.setUTCHours(24, 0, 0, 0);
    for (const project of due) {
      try {
        const id = `${project.projectId}:${now.toISOString().slice(0, 10)}`;
        const existing = await workflow.get(id).catch((error: unknown) => {
          if (
            error instanceof Error &&
            error.message === "Workflow instance not found"
          )
            return null;
          throw error;
        });
        if (!existing) await workflow.create({ id, params: project });
        await MonitoringRepository.nextRun(
          project.projectId,
          nextDay.toISOString(),
        );
      } catch (error) {
        console.warn("monitoring.project_failed", {
          projectId: project.projectId,
          code: errorCode(error),
        });
      }
    }
    return;
  }
  for (const project of due) {
    try {
      await syncProject(project.projectId, project.organizationId, now);
    } catch (error) {
      console.warn("monitoring.project_failed", {
        projectId: project.projectId,
        code: errorCode(error),
      });
    }
  }
}

async function overview(organizationId: string) {
  const projects = (
    await ProjectRepository.listProjects(organizationId)
  ).filter((project) => project.domain);
  for (const project of projects)
    await MonitoringRepository.getSettings(project.id, organizationId);
  const [monitoring, budget] = await Promise.all([
    MonitoringRepository.overview(organizationId),
    UsageBudgetService.overview(organizationId),
  ]);
  return {
    projects,
    monitoring,
    budget,
    budgetTimeZone: "UTC",
    reportingTimeZone: "Europe/Paris",
    usdToEurIsPlanningRate: true,
  };
}
async function updateSettings(
  projectId: string,
  organizationId: string,
  input: { enabled: boolean; backfillDays: number },
) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  await MonitoringRepository.updateSettings(projectId, organizationId, {
    enabled: input.enabled,
    backfillDays: input.backfillDays,
  });
}
export const MonitoringService = {
  syncProject,
  runScheduled,
  overview,
  updateSettings,
};
