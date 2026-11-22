import type { WorkflowStep } from "cloudflare:workers";
import { z } from "zod";
import { MonitoringService } from "@/server/features/monitoring/MonitoringService";
import type { WorkflowJob } from "./workflowStore";

const monitoringPayload = z.object({
  projectId: z.string().min(1),
  organizationId: z.string().min(1),
});

export async function runMaintenanceWorkflow(
  job: Pick<WorkflowJob, "createdAt" | "payloadText">,
  step: WorkflowStep,
) {
  const { projectId, organizationId } = monitoringPayload.parse(
    JSON.parse(job.payloadText),
  );
  // Keep the daily refresh cycle stable across replays and midnight. Each
  // checkpoint collects one day per source, so a daily trigger still covers
  // the seven recent days and advances the historical backfill.
  const cycleDate = z.coerce.date().parse(job.createdAt);
  for (let day = 0; day < 14; day++) {
    const result = await step.do(
      `monitoring-day-${day}`,
      {
        timeout: "230 seconds",
        retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
      },
      () => MonitoringService.syncProject(projectId, organizationId, cycleDate),
    );
    // syncProject rechecks the organization and enabled setting every time.
    if (result.status !== "synced") return result;
  }
  return { status: "synced" as const };
}
