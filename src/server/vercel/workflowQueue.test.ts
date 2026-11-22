import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { send } from "@vercel/queue";
import { WorkflowStore, type WorkflowJob } from "./workflowStore";
import { runDueWorkflows } from "./workflowRunner";
import { enqueueWorkflow, handleWorkflowQueueMessage } from "./workflowQueue";

vi.mock("@vercel/queue", () => ({ send: vi.fn() }));
vi.mock("@/db", () => ({
  withPgClient: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/server/lib/dataforseo/request-slots", () => ({
  withDataforseoSlots: (fn: () => unknown) => fn(),
}));
vi.mock("./workflowStore", () => ({ WorkflowStore: { getJob: vi.fn() } }));
vi.mock("./workflowRunner", () => ({ runDueWorkflows: vi.fn() }));

const stamp = "2026-11-22T12:00:00.000Z";
function job(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    jobKey: "site-audit:audit",
    kind: "site-audit",
    instanceId: "audit",
    projectId: "project",
    payloadText: '{"private":"data"}',
    state: "queued",
    generation: 2,
    outputText: null,
    errorText: null,
    createdAt: stamp,
    nextRunAt: stamp,
    leaseUntil: null,
    leaseToken: null,
    updatedAt: stamp,
    ...overrides,
  };
}
function event(
  message: unknown = { jobKey: "site-audit:audit", generation: 2 },
) {
  return {
    message,
    metadata: { topicName: "seogeo-workflows", messageId: "message-current" },
    send,
  };
}

beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.useFakeTimers();
  vi.setSystemTime(stamp);
  vi.mocked(WorkflowStore.getJob).mockResolvedValue(null);
  vi.mocked(runDueWorkflows).mockResolvedValue({ processed: 0 });
  vi.mocked(send).mockResolvedValue({ messageId: "message-next" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("does not publish or inspect jobs outside Vercel", async () => {
  vi.stubEnv("VERCEL", "");
  await enqueueWorkflow("site-audit:audit");
  await handleWorkflowQueueMessage(event());
  expect(WorkflowStore.getJob).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("publishes only job identity using persisted generation, lease and stable deduplication", async () => {
  vi.mocked(WorkflowStore.getJob).mockResolvedValue(
    job({
      generation: 3,
      nextRunAt: "2026-11-22T12:00:30.000Z",
      leaseUntil: "2026-11-22T12:01:00.000Z",
    }),
  );
  await enqueueWorkflow("site-audit:audit");
  await enqueueWorkflow("site-audit:audit");
  await enqueueWorkflow("site-audit:audit", {
    deduplicationToken: "daily:2026-11-22",
  });
  const calls = vi.mocked(send).mock.calls;
  expect(calls[0][0]).toBe("seogeo-workflows");
  expect(calls[0][1]).toEqual({ jobKey: "site-audit:audit", generation: 3 });
  expect(calls[0][2]).toMatchObject({
    retentionSeconds: 604800,
    delaySeconds: 60,
  });
  expect(calls[0][2]?.idempotencyKey).toMatch(/^workflow:[a-f0-9]{64}$/);
  expect(calls[0][2]?.idempotencyKey).toBe(calls[1][2]?.idempotencyKey);
  expect(calls[0][2]?.idempotencyKey).not.toBe(calls[2][2]?.idempotencyKey);
});

it("delivers a long sleep before message expiry so it can schedule its successor", async () => {
  vi.mocked(WorkflowStore.getJob).mockResolvedValue(
    job({ nextRunAt: "2026-12-22T12:00:00.000Z" }),
  );
  await enqueueWorkflow("site-audit:audit");
  expect(vi.mocked(send).mock.calls[0][2]).toMatchObject({
    retentionSeconds: 604800,
    delaySeconds: 604740,
  });
});

it("ignores other topics and malformed identity before reading any jobs", async () => {
  await handleWorkflowQueueMessage({
    ...event(),
    metadata: { topicName: "other", messageId: "other" },
  });
  await handleWorkflowQueueMessage(
    event({
      jobKey: "site-audit:audit",
      generation: 2,
      payload: { injected: true },
    }),
  );
  expect(WorkflowStore.getJob).not.toHaveBeenCalled();
  expect(runDueWorkflows).not.toHaveBeenCalled();
});

it.each([
  job({ generation: 3 }),
  job({ state: "complete" }),
  job({ state: "errored" }),
  job({ state: "terminated" }),
  job({ state: "paused" }),
  null,
])(
  "ignores stale, absent or inactive persisted jobs (%#)",
  async (persisted) => {
    vi.mocked(WorkflowStore.getJob).mockResolvedValue(persisted);
    await handleWorkflowQueueMessage(event());
    expect(runDueWorkflows).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  },
);

it("runs one due job and schedules its persisted continuation", async () => {
  vi.mocked(WorkflowStore.getJob)
    .mockResolvedValueOnce(job())
    .mockResolvedValue(
      job({ state: "waiting", nextRunAt: "2026-11-22T12:02:00.000Z" }),
    );
  await handleWorkflowQueueMessage(event());
  expect(runDueWorkflows).toHaveBeenCalledExactlyOnceWith({
    jobKey: "site-audit:audit",
    budgetMs: 270000,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(vi.mocked(send).mock.calls[0][2]?.delaySeconds).toBe(120);
});

it("reschedules a live lease with a successor key stable across redeliveries", async () => {
  vi.mocked(WorkflowStore.getJob).mockResolvedValue(
    job({ leaseUntil: "2026-11-22T12:03:00.000Z" }),
  );
  await enqueueWorkflow("site-audit:audit");
  await handleWorkflowQueueMessage(event());
  await handleWorkflowQueueMessage(event());
  expect(runDueWorkflows).not.toHaveBeenCalled();
  const calls = vi.mocked(send).mock.calls;
  expect(calls[1][2]?.delaySeconds).toBe(180);
  expect(calls[0][2]?.idempotencyKey).not.toBe(calls[1][2]?.idempotencyKey);
  expect(calls[1][2]?.idempotencyKey).toBe(calls[2][2]?.idempotencyKey);
});

it.each([
  job({ state: "complete" }),
  job({ state: "paused" }),
  job({ generation: 3 }),
])(
  "does not continue after a concurrent stop or restart (%#)",
  async (current) => {
    vi.mocked(WorkflowStore.getJob)
      .mockResolvedValueOnce(job())
      .mockResolvedValue(current);
    await handleWorkflowQueueMessage(event());
    expect(send).not.toHaveBeenCalled();
  },
);

it("lets failed continuation publishing reject the callback for queue redelivery", async () => {
  vi.mocked(WorkflowStore.getJob)
    .mockResolvedValueOnce(job())
    .mockResolvedValue(
      job({ state: "waiting", nextRunAt: "2026-11-22T12:02:00.000Z" }),
    );
  vi.mocked(send).mockRejectedValue(new Error("queue unavailable"));
  await expect(handleWorkflowQueueMessage(event())).rejects.toThrow(
    "queue unavailable",
  );
  expect(runDueWorkflows).toHaveBeenCalledTimes(1);
});
