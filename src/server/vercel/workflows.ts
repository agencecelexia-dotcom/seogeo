import { z } from "zod";
const kinds = [
  "site-audit",
  "rank-check",
  "ai-visibility",
  "local-rank",
] as const;
type VercelWorkflowKind = (typeof kinds)[number];
const payloadShape = z
  .object({
    projectId: z.string().optional(),
    setupProjectId: z.string().optional(),
    billingCustomer: z
      .object({ projectId: z.string().optional() })
      .passthrough()
      .optional(),
    customer: z
      .object({ projectId: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

function instance(jobKey: string, id: string) {
  return {
    id,
    async status() {
      const { WorkflowStore } = await import("./workflowStore");
      const job = await WorkflowStore.getJob(jobKey);
      if (!job) throw new Error("Workflow instance not found");
      return {
        status: job.state,
        error: job.errorText
          ? { name: "WorkflowError", message: job.errorText }
          : undefined,
        output: job.outputText
          ? z
              .object({ value: z.unknown().optional() })
              .parse(JSON.parse(job.outputText)).value
          : undefined,
      };
    },
    async terminate() {
      const { WorkflowStore } = await import("./workflowStore");
      await WorkflowStore.controlJob(jobKey, "terminate");
    },
    async restart() {
      const { WorkflowStore } = await import("./workflowStore");
      await WorkflowStore.controlJob(jobKey, "restart");
    },
    async pause() {
      const { WorkflowStore } = await import("./workflowStore");
      await WorkflowStore.controlJob(jobKey, "pause");
    },
    async resume() {
      const { WorkflowStore } = await import("./workflowStore");
      await WorkflowStore.controlJob(jobKey, "resume");
    },
    async sendEvent() {
      throw new Error("This workflow adapter does not consume external events");
    },
  };
}
export function createWorkflowBinding<P>(kind: VercelWorkflowKind) {
  z.enum(kinds).parse(kind);
  async function create(options: { id?: string; params: P }) {
    const id = options.id ?? crypto.randomUUID();
    if (!id || id.length > 200) throw new Error("Invalid workflow instance id");
    const payload = payloadShape.parse(options.params);
    const payloadText = JSON.stringify(payload);
    if (payloadText.length > 4 * 1024 * 1024)
      throw new Error("Workflow payload exceeds 4 MiB");
    const projectId =
      payload.projectId ??
      payload.setupProjectId ??
      payload.customer?.projectId ??
      payload.billingCustomer?.projectId ??
      null;
    const jobKey = `${kind}:${id}`;
    const { WorkflowStore } = await import("./workflowStore");
    const job = await WorkflowStore.createJob({
      jobKey,
      instanceId: id,
      kind,
      projectId,
      payloadText,
    });
    if (!job || job.payloadText !== payloadText)
      throw new Error("Workflow id already exists with another payload");
    if (["complete", "errored", "terminated"].includes(job.state))
      throw new Error(
        "Workflow instance already finished; restart it explicitly",
      );
    return instance(jobKey, id);
  }
  return {
    create,
    async get(id: string) {
      const jobKey = `${kind}:${id}`;
      const { WorkflowStore } = await import("./workflowStore");
      if (!(await WorkflowStore.getJob(jobKey)))
        throw new Error("Workflow instance not found");
      return instance(jobKey, id);
    },
    async createBatch(options: { id?: string; params: P }[]) {
      if (options.length > 100)
        throw new Error("Workflow batch exceeds 100 instances");
      return Promise.all(options.map(create));
    },
  };
}
export async function runDueWorkflows(options?: { budgetMs?: number }) {
  return (await import("./workflowRunner")).runDueWorkflows(options);
}
export async function maintainWorkflowStorage() {
  return (await import("./workflowStore")).WorkflowStore.cleanup();
}

// Account erasure uses the namespace directly; crawl RPCs use getAuditScratchpad.
export function createScratchpadBinding() {
  return {
    idFromName: (name: string) => name,
    get: (id: { toString(): string }) => ({
      async destroyForErasure() {
        const { PostgresAuditScratchpad } = await import("./auditScratchpad");
        await new PostgresAuditScratchpad(id.toString()).destroyForErasure();
      },
      async destroy() {
        const { PostgresAuditScratchpad } = await import("./auditScratchpad");
        await new PostgresAuditScratchpad(id.toString()).destroy();
      },
    }),
  };
}
