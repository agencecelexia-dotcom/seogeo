/* eslint-disable no-restricted-imports -- Vercel's persistent job runtime is a Postgres infrastructure adapter. */
import { sql } from "drizzle-orm";
import { withPgClient } from "@/db";
import { pgDb } from "@/db/pg/client";
import type {
  vercelWorkflowJobs as jobs,
  vercelWorkflowSteps as steps,
} from "@/db/schema";

export type WorkflowJob = typeof jobs.$inferSelect;
export type WorkflowCheckpoint = typeof steps.$inferSelect;
type JobLease = Pick<WorkflowJob, "jobKey" | "generation" | "leaseToken">;

async function getJob(jobKey: string): Promise<WorkflowJob | null> {
  return withPgClient(async () => {
    // The canonical tables have SQLite type identity; raw SQL is used only by
    // this Postgres-specific runtime so its transaction and lease semantics are explicit.
    const rows = await pgDb.execute<{
      row: WorkflowJob;
    }>(sql`SELECT json_build_object(
      'jobKey',job_key,'kind',kind,'instanceId',instance_id,'projectId',project_id,
      'payloadText',payload_text,'state',state,'generation',generation,'outputText',output_text,
      'errorText',error_text,'createdAt',created_at,'nextRunAt',next_run_at,
      'leaseUntil',lease_until,'leaseToken',lease_token,'updatedAt',updated_at
    ) AS row FROM vercel_workflow_jobs WHERE job_key=${jobKey}`);
    return rows[0]?.row ?? null;
  });
}
async function createJob(input: {
  jobKey: string;
  kind: string;
  instanceId: string;
  projectId: string | null;
  payloadText: string;
}) {
  return withPgClient(async () => {
    const stamp = new Date().toISOString();
    await pgDb.execute(sql`INSERT INTO vercel_workflow_jobs(job_key,kind,instance_id,project_id,payload_text,state,created_at,next_run_at,updated_at)
      VALUES (${input.jobKey},${input.kind},${input.instanceId},${input.projectId},${input.payloadText},'queued',${stamp},${stamp},${stamp})
      ON CONFLICT(job_key) DO NOTHING`);
    return getJob(input.jobKey);
  });
}
async function claimJob(
  stamp: string,
  leaseUntil: string,
  jobKey?: string,
): Promise<WorkflowJob | null> {
  return withPgClient(async () => {
    const token = crypto.randomUUID();
    const rows = await pgDb.execute<{
      job_key: string;
    }>(sql`UPDATE vercel_workflow_jobs SET state='running', lease_token=${token}, lease_until=${leaseUntil}, updated_at=${stamp}
      WHERE job_key=(SELECT job_key FROM vercel_workflow_jobs WHERE state IN ('queued','waiting','running')
      AND next_run_at<=${stamp} AND (lease_until IS NULL OR lease_until<=${stamp})
      ${jobKey === undefined ? sql`` : sql`AND job_key=${jobKey}`}
      ORDER BY next_run_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING job_key`);
    return rows[0] ? getJob(rows[0].job_key) : null;
  });
}
async function listRunnableJobs(limit = 100): Promise<string[]> {
  return withPgClient(async () => {
    const stamp = new Date().toISOString();
    const rows = await pgDb.execute<{ job_key: string }>(sql`
      SELECT job_key FROM vercel_workflow_jobs
      WHERE state IN ('queued','waiting','running') AND next_run_at<=${stamp}
      AND (lease_until IS NULL OR lease_until<=${stamp})
      ORDER BY next_run_at,created_at LIMIT ${Math.max(1, Math.min(100, limit))}`);
    return rows.map((row) => row.job_key);
  });
}
async function ownsLease(job: JobLease) {
  return withPgClient(async () => {
    const rows = await pgDb.execute(
      sql`SELECT job_key FROM vercel_workflow_jobs WHERE job_key=${job.jobKey} AND generation=${job.generation} AND lease_token=${job.leaseToken} AND state='running'`,
    );
    return rows.length > 0;
  });
}
async function getStep(
  job: JobLease,
  name: string,
): Promise<WorkflowCheckpoint | null> {
  return withPgClient(async () => {
    const rows = await pgDb.execute<{
      row: WorkflowCheckpoint;
    }>(sql`SELECT json_build_object(
      'jobKey',job_key,'generation',generation,'name',name,'state',state,'attempts',attempts,
      'nextRunAt',next_run_at,'resultText',result_text,'errorText',error_text,'updatedAt',updated_at
    ) AS row FROM vercel_workflow_steps WHERE job_key=${job.jobKey} AND generation=${job.generation} AND name=${name}`);
    return rows[0]?.row ?? null;
  });
}
async function saveStep(
  job: JobLease,
  step: Omit<WorkflowCheckpoint, "jobKey" | "generation" | "updatedAt">,
) {
  return withPgClient(async () => {
    const rows =
      await pgDb.execute(sql`INSERT INTO vercel_workflow_steps(job_key,generation,name,state,attempts,next_run_at,result_text,error_text,updated_at)
      SELECT job_key,generation,${step.name},${step.state},${step.attempts},${step.nextRunAt},${step.resultText},${step.errorText},${new Date().toISOString()}
      FROM vercel_workflow_jobs WHERE job_key=${job.jobKey} AND generation=${job.generation} AND lease_token=${job.leaseToken} AND state='running'
      ON CONFLICT(job_key,generation,name) DO UPDATE SET state=EXCLUDED.state,attempts=EXCLUDED.attempts,
      next_run_at=EXCLUDED.next_run_at,result_text=EXCLUDED.result_text,error_text=EXCLUDED.error_text,updated_at=EXCLUDED.updated_at
      RETURNING name`);
    return rows.length > 0;
  });
}
async function finishJob(
  job: JobLease,
  input: {
    state: string;
    nextRunAt: string;
    outputText?: string | null;
    errorText?: string | null;
  },
) {
  return withPgClient(async () => {
    await pgDb.execute(sql`UPDATE vercel_workflow_jobs SET state=${input.state},next_run_at=${input.nextRunAt},
      output_text=${input.outputText ?? null},error_text=${input.errorText ?? null},updated_at=${new Date().toISOString()},
      lease_token=NULL,lease_until=NULL
      WHERE job_key=${job.jobKey} AND generation=${job.generation} AND lease_token=${job.leaseToken} AND state='running'`);
  });
}
async function controlJob(
  jobKey: string,
  action: "terminate" | "pause" | "resume" | "restart",
) {
  return withPgClient(async () => {
    const stamp = new Date().toISOString();
    if (action === "restart") {
      // A live callback may still be completing a paid call. Never overlap it.
      const rows =
        await pgDb.execute(sql`UPDATE vercel_workflow_jobs SET state='queued',generation=generation+1,
        created_at=${stamp},next_run_at=${stamp},updated_at=${stamp},output_text=NULL,error_text=NULL,lease_token=NULL,lease_until=NULL
        WHERE job_key=${jobKey} AND state IN ('complete','errored','terminated') AND (lease_until IS NULL OR lease_until<=${stamp}) RETURNING job_key`);
      if (!rows.length)
        throw new Error(
          "Workflow cannot restart while an invocation may still be active",
        );
      return;
    }
    const state =
      action === "terminate"
        ? "terminated"
        : action === "pause"
          ? "paused"
          : "queued";
    await pgDb.execute(sql`UPDATE vercel_workflow_jobs SET state=${state},updated_at=${stamp},next_run_at=${stamp}
      WHERE job_key=${jobKey} AND state IN ('queued','waiting','running','paused')`);
  });
}
async function cleanup() {
  return withPgClient(async () => {
    const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();
    await pgDb.execute(
      sql`DELETE FROM vercel_workflow_jobs WHERE state IN ('complete','errored','terminated') AND updated_at<${cutoff} AND (lease_until IS NULL OR lease_until<${cutoff})`,
    );
    await pgDb.execute(
      sql`DELETE FROM vercel_audit_scratchpads WHERE expires_at<${new Date().toISOString()}`,
    );
  });
}
export const WorkflowStore = {
  getJob,
  createJob,
  claimJob,
  listRunnableJobs,
  ownsLease,
  getStep,
  saveStep,
  finishJob,
  controlJob,
  cleanup,
};
