import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "./middleware";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { AuditScheduleService } from "@/server/features/audit-schedule/AuditScheduleService";

export const getAuditSchedules = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => AuditScheduleService.list(context.organizationId));
export const updateAuditSchedule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      enabled: z.boolean(),
      maxPages: z.number().int().min(1).max(1000),
    }),
  )
  .handler(async ({ context, data }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await AuditScheduleService.configure({
      ...data,
      projectId: context.projectId,
      authorizedByUserId: context.userId,
    });
    return { success: true };
  });
