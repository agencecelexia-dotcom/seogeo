import type { WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { z } from "zod";
import type { WorkflowJob, WorkflowStore } from "./workflowStore";

type Store = Pick<typeof WorkflowStore, "getStep" | "saveStep" | "ownsLease">;
type Yield = { state: "waiting"; nextRunAt: string };
type Finished =
  | { state: "complete"; output: unknown }
  | { state: "errored"; error: unknown };
const errorSchema = z.object({
  name: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
const errorText = (error: unknown) =>
  JSON.stringify({
    name: error instanceof Error ? error.name : "Error",
    message: (error instanceof Error ? error.message : String(error)).slice(
      0,
      4000,
    ),
    code:
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined,
  });
function restoreError(value: string | null) {
  const stored = errorSchema.safeParse(value ? JSON.parse(value) : null);
  const error = new Error(
    stored.success ? stored.data.message : "Workflow step failed",
  );
  if (stored.success) Object.assign(error, stored.data);
  return error;
}
function milliseconds(value: string | number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  const match =
    /^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?|d|days?)$/.exec(
      value,
    );
  if (!match) throw new Error(`Unsupported workflow duration: ${value}`);
  const unit = match[2];
  const factor =
    unit === "ms" || unit.startsWith("millisecond")
      ? 1
      : unit === "m" || unit.startsWith("minute")
        ? 60000
        : unit.startsWith("h")
          ? 3600000
          : unit.startsWith("d")
            ? 86400000
            : 1000;
  return Number(match[1]) * factor;
}

/** Replays persisted checkpoints. A voluntary yield never rejects the workflow:
 * upstream catch/finally blocks must not turn a timer into a failure or settlement.
 * There are no in-flight step callbacks at a yield; only the suspended continuation
 * remains, with no timer/socket. The next invocation builds it again from Postgres.
 */
export async function executeWorkflowSlice(
  job: WorkflowJob,
  store: Store,
  run: (step: WorkflowStep) => Promise<unknown>,
  budgetMs = 650000,
): Promise<Yield | Finished> {
  const startedAt = Date.now();
  let yielded = false;
  let activeOperations = 0;
  let pendingYield: Yield | undefined;
  let publishYield!: (result: Yield) => void;
  const yieldResult = new Promise<Yield>((resolve) => {
    publishYield = resolve;
  });
  const flushYield = () => {
    if (pendingYield && activeOperations === 0) publishYield(pendingYield);
  };
  const suspend = (nextRunAt: string): Promise<never> => {
    if (!yielded) {
      yielded = true;
      pendingYield = { state: "waiting", nextRunAt };
    }
    flushYield();
    return new Promise<never>(() => {});
  };
  const checkLease = async () => {
    if (yielded) return false;
    const owned = await store.ownsLease(job);
    return owned && !yielded;
  };
  const inFlight = new Map<string, Promise<unknown>>();

  async function executeStep<T>(
    name: string,
    config: WorkflowStepConfig | undefined,
    callback: () => Promise<T>,
  ): Promise<T> {
    // Count SQL admission too: another parallel step may request a yield while
    // this one is persisting its running marker, before its callback begins.
    activeOperations++;
    try {
      if (!(await checkLease()))
        return suspend(new Date(Date.now() + 60000).toISOString());
      const existing = await store.getStep(job, name);
      if (existing?.state === "complete") {
        // Checkpoints are produced by this callback and replayed only for its stable name.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- durable generic result round-trip
        return z
          .object({ value: z.unknown().optional() })
          .parse(JSON.parse(existing.resultText ?? "{}")).value as T;
      }
      if (existing?.state === "errored") throw restoreError(existing.errorText);
      if (existing?.nextRunAt && Date.parse(existing.nextRunAt) > Date.now())
        return suspend(existing.nextRunAt);
      const limit = config?.retries?.limit ?? 2;
      const attempts = existing?.attempts ?? 0;
      // A running checkpoint on a new lease means the previous invocation died.
      // Never re-issue a paid/no-retry call whose outcome could have been lost.
      if (attempts > limit) {
        const text =
          existing?.errorText ??
          errorText(
            new Error(
              "Previous invocation ended before the step outcome was confirmed; no automatic paid retry",
            ),
          );
        await store.saveStep(job, {
          name,
          state: "errored",
          attempts,
          nextRunAt: null,
          resultText: null,
          errorText: text,
        });
        throw restoreError(text);
      }
      const timeoutMs = milliseconds(config?.timeout, 600000);
      if (timeoutMs > 600000)
        throw new Error(
          "Workflow step exceeds Vercel’s supported ten-minute step ceiling",
        );
      if (Date.now() - startedAt + timeoutMs + 30000 > budgetMs)
        return suspend(new Date(Date.now() + 1000).toISOString());
      if (
        !(await store.saveStep(job, {
          name,
          state: "running",
          attempts: attempts + 1,
          nextRunAt: null,
          resultText: null,
          errorText: null,
        }))
      )
        return suspend(new Date(Date.now() + 60000).toISOString());
      try {
        // The function platform is the hard timeout. We admit a callback only
        // with its full declared timeout available; aborting a Promise cannot
        // cancel its paid side effects, so no timeout races start another copy.
        const result = await callback();
        const resultText = JSON.stringify({ value: result });
        if (resultText.length > 16 * 1024 * 1024)
          throw new Error("Workflow checkpoint exceeds 16 MiB");
        if (
          !(await store.saveStep(job, {
            name,
            state: "complete",
            attempts: attempts + 1,
            nextRunAt: null,
            resultText,
            errorText: null,
          }))
        )
          return suspend(new Date(Date.now() + 60000).toISOString());
        return result;
      } catch (error) {
        if (!(await store.ownsLease(job)))
          return suspend(new Date(Date.now() + 60000).toISOString());
        const terminal =
          attempts >= limit ||
          (error instanceof Error && error.name === "NonRetryableError");
        const delay =
          milliseconds(config?.retries?.delay, 10000) *
          (config?.retries?.backoff === "exponential"
            ? 2 ** attempts
            : config?.retries?.backoff === "linear"
              ? attempts + 1
              : 1);
        const nextRunAt = terminal
          ? null
          : new Date(Date.now() + Math.min(delay, 86400000)).toISOString();
        await store.saveStep(job, {
          name,
          state: terminal ? "errored" : "waiting",
          attempts: attempts + 1,
          nextRunAt,
          resultText: null,
          errorText: errorText(error),
        });
        if (nextRunAt) return suspend(nextRunAt);
        throw error;
      }
    } finally {
      activeOperations--;
      flushYield();
    }
  }
  function stepDo<T extends Rpc.Serializable<T>>(
    name: string,
    configOrCallback: WorkflowStepConfig | (() => Promise<T>),
    callback?: () => Promise<T>,
  ): Promise<T> {
    const existing = inFlight.get(name);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same step name shares the same durable result type
    if (existing) return existing as Promise<T>;
    const fn =
      typeof configOrCallback === "function" ? configOrCallback : callback;
    if (!fn) throw new Error("Missing workflow callback");
    const promise = executeStep(
      name,
      typeof configOrCallback === "function" ? undefined : configOrCallback,
      fn,
    );
    inFlight.set(name, promise);
    return promise;
  }
  async function sleepUntil(name: string, date: Date | number) {
    activeOperations++;
    try {
      if (!(await checkLease()))
        return suspend(new Date(Date.now() + 60000).toISOString());
      const existing = await store.getStep(job, `timer:${name}`);
      if (existing?.state === "complete") return;
      const wakeAt = existing?.nextRunAt ?? new Date(date).toISOString();
      if (Date.parse(wakeAt) > Date.now()) {
        await store.saveStep(job, {
          name: `timer:${name}`,
          state: "waiting",
          attempts: 0,
          nextRunAt: wakeAt,
          resultText: null,
          errorText: null,
        });
        return suspend(wakeAt);
      }
      await store.saveStep(job, {
        name: `timer:${name}`,
        state: "complete",
        attempts: 0,
        nextRunAt: null,
        resultText: "{}",
        errorText: null,
      });
    } finally {
      activeOperations--;
      flushYield();
    }
  }
  const step: WorkflowStep = {
    do: stepDo,
    sleep: (name, duration) =>
      sleepUntil(name, Date.now() + milliseconds(duration, 0)),
    sleepUntil,
    waitForEvent: () =>
      Promise.reject(
        new Error(
          "Event waits are not used by these workflows and are not supported by this adapter",
        ),
      ),
  };
  return Promise.race([
    yieldResult,
    run(step).then(
      (output): Finished => ({ state: "complete", output }),
      (error): Finished => ({ state: "errored", error }),
    ),
  ]);
}
