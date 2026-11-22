import { env } from "cloudflare:workers";
import type { WorkflowStep } from "cloudflare:workers";
import { withPgClient } from "@/db";
import { WorkflowStore, type WorkflowJob } from "./workflowStore";
import { executeWorkflowSlice } from "./workflowEngine";

async function run(job: WorkflowJob, step: WorkflowStep) {
  if (job.kind === "backlink-discovery")
    return (
      await import("./backlinkDiscoveryWorkflow")
    ).runBacklinkDiscoveryWorkflow(job, step);
  if (job.kind === "monitoring-sync")
    return (await import("./maintenanceWorkflow")).runMaintenanceWorkflow(
      job,
      step,
    );
  const classes = {
    "site-audit": () =>
      import("@/server/workflows/SiteAuditWorkflow").then(
        (module) => module.SiteAuditWorkflow,
      ),
    "rank-check": () =>
      import("@/server/workflows/RankCheckWorkflow").then(
        (module) => module.RankCheckWorkflow,
      ),
    "ai-visibility": () =>
      import("@/server/workflows/AiVisibilityWorkflow").then(
        (module) => module.AiVisibilityWorkflow,
      ),
    "local-rank": () =>
      import("@/server/workflows/LocalRankWorkflow").then(
        (module) => module.LocalRankWorkflow,
      ),
  };
  if (!(job.kind in classes)) throw new Error("Unknown workflow kind");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated against the fixed loader map
  const Constructor = await classes[job.kind as keyof typeof classes]();
  // WorkflowEntrypoint's Vercel bridge receives only env; none of these classes
  // use ctx. No background promise is scheduled through this context.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cloudflare/Vercel constructor boundary
  const instance = new Constructor({} as ExecutionContext, env);
  const event = {
    instanceId: job.instanceId,
    timestamp: new Date(job.createdAt),
    payload: JSON.parse(job.payloadText) as unknown,
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- private persisted payload was created by the typed upstream binding
  const runner = instance as unknown as {
    run(workflowEvent: typeof event, step: WorkflowStep): Promise<unknown>;
  };
  return runner.run(event, step);
}
export async function runDueWorkflows({
  budgetMs = 270000,
  jobKey,
}: { budgetMs?: number; jobKey?: string } = {}) {
  if (process.env.RUNTIME_PLATFORM !== "vercel")
    throw new Error("Vercel workflow runner requires RUNTIME_PLATFORM=vercel");
  if (budgetMs < 60000) return { processed: 0, reason: "invocation-budget" };
  return withPgClient(async () => {
    const now = Date.now();
    const job = await WorkflowStore.claimJob(
      new Date(now).toISOString(),
      new Date(now + 330000).toISOString(),
      jobKey,
    );
    if (!job) return { processed: 0 };
    const result = await executeWorkflowSlice(
      job,
      WorkflowStore,
      (step) => run(job, step),
      Math.min(budgetMs, 270000),
    );
    if (result.state === "waiting")
      await WorkflowStore.finishJob(job, {
        state: "waiting",
        nextRunAt: result.nextRunAt,
      });
    else
      await WorkflowStore.finishJob(job, {
        state: result.state,
        nextRunAt: new Date().toISOString(),
        outputText:
          result.state === "complete"
            ? JSON.stringify({ value: result.output })
            : null,
        errorText:
          result.state === "errored"
            ? (result.error instanceof Error
                ? result.error.message
                : String(result.error)
              ).slice(0, 4000)
            : null,
      });
    return {
      processed: 1,
      jobKey: job.jobKey,
      instanceId: job.instanceId,
      state: result.state,
      nextRunAt: result.state === "waiting" ? result.nextRunAt : undefined,
    };
  });
}
