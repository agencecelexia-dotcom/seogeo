import { createHash } from "node:crypto";
import { send, type MessageMetadata } from "@vercel/queue";
import { z } from "zod";
import { withPgClient } from "@/db";
import { setRuntimeAuthMode } from "@/lib/auth-mode";
import { withDataforseoSlots } from "@/server/lib/dataforseo/request-slots";
import { WorkflowStore, type WorkflowJob } from "./workflowStore";

const TOPIC = "seogeo-workflows";
const RETENTION_SECONDS = 7 * 24 * 60 * 60;
const ACTIVE_STATES = new Set(["queued", "waiting", "running"]);
const messageSchema = z
  .object({
    jobKey: z.string().min(1).max(256),
    generation: z.number().int().nonnegative(),
  })
  .strict();

type PublishOptions = { deduplicationToken?: string };
type QueueEvent = {
  message: unknown;
  metadata: Pick<MessageMetadata, "topicName" | "messageId">;
  send: typeof send;
};

function dueAt(job: WorkflowJob): number {
  const nextRunAt = Date.parse(job.nextRunAt);
  const leaseUntil = job.leaseUntil ? Date.parse(job.leaseUntil) : 0;
  if (!Number.isFinite(nextRunAt) || !Number.isFinite(leaseUntil))
    throw new Error("Invalid persisted workflow schedule");
  return Math.max(nextRunAt, leaseUntil);
}

async function publishJob(
  job: WorkflowJob,
  publish: typeof send,
  options: PublishOptions = {},
): Promise<void> {
  if (!ACTIVE_STATES.has(job.state)) return;
  const snapshot = JSON.stringify([
    job.jobKey,
    job.generation,
    job.updatedAt,
    job.state,
    job.nextRunAt,
    job.leaseUntil,
    options.deduplicationToken ?? null,
  ]);
  const idempotencyKey = `workflow:${createHash("sha256").update(snapshot).digest("hex")}`;
  // Leave a minute between the delivery time and expiry for very long sleeps.
  // The next callback reads the schedule again and can enqueue another slice.
  const delaySeconds = Math.min(
    RETENTION_SECONDS - 60,
    Math.max(0, Math.ceil((dueAt(job) - Date.now()) / 1000)),
  );
  await publish(
    TOPIC,
    { jobKey: job.jobKey, generation: job.generation },
    {
      idempotencyKey,
      retentionSeconds: RETENTION_SECONDS,
      delaySeconds,
    },
  );
}

/** Publish a wake-up only after the job has been durably persisted. */
export async function enqueueWorkflow(
  jobKey: string,
  options: PublishOptions = {},
): Promise<void> {
  if (process.env.VERCEL !== "1") return;
  const job = await WorkflowStore.getJob(jobKey);
  if (job) await publishJob(job, send, options);
}

/** Nitro authenticates queue deliveries before dispatching this runtime hook. */
export async function handleWorkflowQueueMessage(
  event: QueueEvent,
): Promise<void> {
  if (process.env.VERCEL !== "1" || event.metadata.topicName !== TOPIC) return;
  const parsed = messageSchema.safeParse(event.message);
  // A malformed message cannot name work. Acknowledge it instead of creating
  // a poison-message retry loop; never log its potentially sensitive payload.
  if (!parsed.success) {
    console.warn("Ignoring invalid workflow queue message");
    return;
  }
  setRuntimeAuthMode("password");
  await withPgClient(() =>
    withDataforseoSlots(async () => {
      const { jobKey, generation } = parsed.data;
      const job = await WorkflowStore.getJob(jobKey);
      if (
        !job ||
        job.generation !== generation ||
        !ACTIVE_STATES.has(job.state)
      )
        return;
      if (dueAt(job) <= Date.now()) {
        // Publishing a job must not eagerly load workflow classes or actors.
        const { runDueWorkflows } = await import("./workflowRunner");
        await runDueWorkflows({ jobKey, budgetMs: 270_000 });
      }

      // The database owns progress, generation and leases. A concurrent pause,
      // termination or restart must not inherit this delivery's continuation.
      const current = await WorkflowStore.getJob(jobKey);
      if (!current || current.generation !== generation) return;
      // Reusing the consumed message's key would hit its deduplication window.
      // Its message ID gives one stable successor even if this callback retries.
      await publishJob(current, event.send, {
        deduplicationToken: `after:${event.metadata.messageId}`,
      });
    }),
  );
  // Publishing failures intentionally escape: Nitro/Queues must redeliver the
  // message. Persisted checkpoints prevent replaying uncertain paid calls.
}
