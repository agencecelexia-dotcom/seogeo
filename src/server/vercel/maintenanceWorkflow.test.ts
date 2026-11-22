import type { WorkflowStep } from "cloudflare:workers";
import { beforeEach, expect, it, vi } from "vitest";
import { runMaintenanceWorkflow } from "./maintenanceWorkflow";

const syncProject = vi.hoisted(() => vi.fn());
vi.mock("@/server/features/monitoring/MonitoringService", () => ({
  MonitoringService: { syncProject },
}));

const job = {
  createdAt: "2026-11-22T12:00:00.000Z",
  payloadText: JSON.stringify({ projectId: "project", organizationId: "org" }),
};
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only step.do is called by this workflow
const step = {
  do: (_name: string, _config: unknown, callback: () => Promise<unknown>) =>
    callback(),
} as unknown as WorkflowStep;

beforeEach(() => syncProject.mockResolvedValue({ status: "synced" }));

it("collects fourteen days in separate checkpoints using the stable daily cycle", async () => {
  expect(await runMaintenanceWorkflow(job, step)).toEqual({ status: "synced" });
  expect(syncProject).toHaveBeenCalledTimes(14);
  for (const call of syncProject.mock.calls)
    expect(call).toEqual(["project", "org", new Date(job.createdAt)]);
});

it.each(["paused", "unavailable", "running", "current"])(
  "ends the daily cycle when collection is %s",
  async (status) => {
    syncProject.mockResolvedValue({ status });
    expect(await runMaintenanceWorkflow(job, step)).toEqual({ status });
    expect(syncProject).toHaveBeenCalledOnce();
  },
);
