import type { WorkflowStep } from "cloudflare:workers";
import { z } from "zod";
import { WorkbenchDiscoveryService } from "@/server/features/workbench/WorkbenchDiscoveryService";
import type { WorkflowJob } from "./workflowStore";

const payloadSchema = z
  .object({
    projectId: z.string().min(1),
    expectedNextRunAt: z.iso.datetime(),
  })
  .strict();

export async function runBacklinkDiscoveryWorkflow(
  job: Pick<WorkflowJob, "payloadText">,
  step: WorkflowStep,
) {
  const { projectId, expectedNextRunAt } = payloadSchema.parse(
    JSON.parse(job.payloadText),
  );
  // A paid call may have succeeded before the invocation died. The monthly CAS
  // and no-retry checkpoint both prevent an automatic second purchase.
  return step.do(
    "discover-backlink-prospects",
    {
      timeout: "230 seconds",
      retries: { limit: 0, delay: "1 second" },
    },
    () => WorkbenchDiscoveryService.runQueued(projectId, expectedNextRunAt),
  );
}
