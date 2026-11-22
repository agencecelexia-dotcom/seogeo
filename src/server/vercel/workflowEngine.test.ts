import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executeWorkflowSlice } from "./workflowEngine";
import type { WorkflowCheckpoint, WorkflowJob } from "./workflowStore";

const job: WorkflowJob = {
  jobKey: "ai-visibility:test",
  kind: "ai-visibility",
  instanceId: "test",
  projectId: "project",
  payloadText: "{}",
  state: "running",
  generation: 0,
  outputText: null,
  errorText: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  nextRunAt: "2026-01-01T00:00:00.000Z",
  leaseUntil: "2026-01-01T00:15:00.000Z",
  leaseToken: "token",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
function persistence() {
  const checkpoints = new Map<string, WorkflowCheckpoint>();
  return {
    checkpoints,
    ownsLease: async () => true,
    getStep: async (_job: unknown, name: string) =>
      checkpoints.get(name) ?? null,
    saveStep: async (
      _job: unknown,
      value: Omit<WorkflowCheckpoint, "jobKey" | "generation" | "updatedAt">,
    ) => {
      checkpoints.set(value.name, {
        ...value,
        jobKey: job.jobKey,
        generation: job.generation,
        updatedAt: new Date().toISOString(),
      });
      return true;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(job.createdAt);
});
afterEach(() => vi.useRealTimers());
it("suspends without running catch/finally and resumes cached steps in a new invocation", async () => {
  const store = persistence();
  const paid = vi.fn(async () => ({ taskId: "provider-task" }));
  let caught = 0;
  let settled = 0;
  const workflow: Parameters<typeof executeWorkflowSlice>[2] = async (step) => {
    try {
      const value = await step.do(
        "post",
        { retries: { limit: 0, delay: "1 second" } },
        paid,
      );
      await step.sleep("wait", "1 hour");
      return value.taskId;
    } catch (error) {
      caught++;
      throw error;
    } finally {
      settled++;
    }
  };
  expect(await executeWorkflowSlice(job, store, workflow)).toMatchObject({
    state: "waiting",
    nextRunAt: "2026-01-01T01:00:00.000Z",
  });
  expect(caught).toBe(0);
  expect(settled).toBe(0);
  vi.setSystemTime("2026-01-01T01:00:00.000Z");
  expect(await executeWorkflowSlice(job, store, workflow)).toEqual({
    state: "complete",
    output: "provider-task",
  });
  expect(paid).toHaveBeenCalledTimes(1);
  expect(settled).toBe(1);
});
it("fails an uncertain no-retry paid step after a crash instead of buying it twice", async () => {
  const store = persistence();
  await store.saveStep(job, {
    name: "paid",
    state: "running",
    attempts: 1,
    nextRunAt: null,
    resultText: null,
    errorText: null,
  });
  const paid = vi.fn(async () => "charged again");
  const result = await executeWorkflowSlice(job, store, (step) =>
    step.do("paid", { retries: { limit: 0, delay: "1 second" } }, paid),
  );
  expect(result.state).toBe("errored");
  expect(paid).not.toHaveBeenCalled();
});
it("stores retry delay and resumes only the unfinished free step", async () => {
  const store = persistence();
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("Transient database error"))
    .mockResolvedValue("ok");
  const workflow: Parameters<typeof executeWorkflowSlice>[2] = (step) =>
    step.do("read", { retries: { limit: 1, delay: "10 seconds" } }, read);
  expect(await executeWorkflowSlice(job, store, workflow)).toMatchObject({
    state: "waiting",
  });
  vi.setSystemTime("2026-01-01T00:00:10.000Z");
  expect(await executeWorkflowSlice(job, store, workflow)).toEqual({
    state: "complete",
    output: "ok",
  });
  expect(read).toHaveBeenCalledTimes(2);
});
it("waits for concurrently started callbacks before releasing an invocation", async () => {
  const store = persistence();
  let finish!: () => void;
  let started!: () => void;
  const hasStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let yielded = false;
  const result = executeWorkflowSlice(job, store, async (step) => {
    const work = step.do("parallel", { timeout: "2 minutes" }, async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return "stored";
    });
    await hasStarted;
    await Promise.all([work, step.sleep("timer", "1 hour")]);
  }).then((value) => {
    yielded = true;
    return value;
  });
  await hasStarted;
  await Promise.resolve();
  expect(yielded).toBe(false);
  finish();
  expect(await result).toMatchObject({ state: "waiting" });
  expect(store.checkpoints.get("parallel")?.state).toBe("complete");
});
it("drains a parallel step whose SQL admission is still pending when another step yields", async () => {
  const store = persistence();
  let admit!: () => void;
  let finish!: () => void;
  let started!: () => void;
  let timerStored!: () => void;
  const admitted = new Promise<void>((resolve) => {
    admit = resolve;
  });
  const hasStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const timerWritten = new Promise<void>((resolve) => {
    timerStored = resolve;
  });
  const delayedStore = {
    ...store,
    saveStep: async (...args: Parameters<typeof store.saveStep>) => {
      if (args[1].name === "parallel" && args[1].state === "running")
        await admitted;
      const saved = await store.saveStep(...args);
      if (args[1].name === "timer:timer") timerStored();
      return saved;
    },
  };
  let released = false;
  const result = executeWorkflowSlice(job, delayedStore, async (step) => {
    await Promise.all([
      step.do("parallel", { timeout: "2 minutes" }, async () => {
        started();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return "stored";
      }),
      step.sleep("timer", "1 hour"),
    ]);
  }).then((value) => {
    released = true;
    return value;
  });
  await timerWritten;
  admit();
  await hasStarted;
  expect(released).toBe(false);
  finish();
  expect(await result).toMatchObject({ state: "waiting" });
  expect(store.checkpoints.get("parallel")?.state).toBe("complete");
});
it("yields before a step that cannot fit and admits it on the next invocation", async () => {
  const store = persistence();
  store.ownsLease = async () => {
    vi.setSystemTime(Date.now() + 1000);
    return true;
  };
  const longStep = vi.fn(async () => "done");
  const workflow: Parameters<typeof executeWorkflowSlice>[2] = async (step) => {
    await step.do("prepare", { timeout: "2 minutes" }, async () => {
      vi.setSystemTime(Date.now() + 120000);
      return "prepared";
    });
    return step.do(
      "long",
      { timeout: "10 minutes", retries: { limit: 0, delay: "1 second" } },
      longStep,
    );
  };
  expect(
    await executeWorkflowSlice(job, store, workflow, 270000),
  ).toMatchObject({ state: "waiting" });
  expect(longStep).not.toHaveBeenCalled();
  expect(await executeWorkflowSlice(job, store, workflow, 270000)).toEqual({
    state: "complete",
    output: "done",
  });
  expect(longStep).toHaveBeenCalledTimes(1);
});
