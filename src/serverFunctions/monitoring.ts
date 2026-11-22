import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "./middleware";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { MonitoringService } from "@/server/features/monitoring/MonitoringService";
import { UsageBudgetService } from "@/server/features/monitoring/UsageBudgetService";
import { usageBudgetInput } from "@/server/features/monitoring/budgetTypes";

const projectInput = z.object({ projectId: z.string().min(1) });

export const getMonitoringOverview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    MonitoringService.overview(context.organizationId),
  );

export const updateMonitoringSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    projectInput.extend({
      enabled: z.boolean(),
      backfillDays: z.number().int().min(7).max(480),
    }),
  )
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await MonitoringService.updateSettings(
      context.projectId,
      context.organizationId,
      data,
    );
    return { success: true };
  });

export const syncMonitoringProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return MonitoringService.syncProject(
      context.projectId,
      context.organizationId,
    );
  });

export const updateUsageBudget = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(usageBudgetInput)
  .handler(async ({ context, data }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await UsageBudgetService.updateSettings(context.organizationId, data);
    return { success: true };
  });
