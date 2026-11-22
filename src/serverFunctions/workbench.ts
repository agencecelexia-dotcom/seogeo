import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { WorkbenchDiscoveryService } from "@/server/features/workbench/WorkbenchDiscoveryService";
import { WorkbenchService } from "@/server/features/workbench/WorkbenchService";
import {
  actionRefSchema,
  createActionSchema,
  discoverySettingsSchema,
  discoverProspectsSchema,
  prospectRefSchema,
  saveProspectSchema,
  updateActionStatusSchema,
  updateProspectStatusSchema,
  workbenchProjectSchema,
} from "@/types/schemas/workbench";

export const listActions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(workbenchProjectSchema)
  .handler(({ context }) => WorkbenchService.listActions(context.projectId));
export const createAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createActionSchema)
  .handler(({ data, context }) =>
    WorkbenchService.createAction({ ...data, projectId: context.projectId }),
  );
export const updateActionStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateActionStatusSchema)
  .handler(({ data, context }) =>
    WorkbenchService.updateActionStatus(
      context.projectId,
      data.actionId,
      data.status,
      data.note,
    ),
  );
export const importAuditActions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(workbenchProjectSchema)
  .handler(({ context }) =>
    WorkbenchService.importAuditActions(context.projectId),
  );
export const verifyAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(actionRefSchema)
  .handler(({ data, context }) =>
    WorkbenchService.verifyAction(context.projectId, data.actionId),
  );
export const listActionEvents = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(actionRefSchema)
  .handler(({ data, context }) =>
    WorkbenchService.listActionEvents(context.projectId, data.actionId),
  );
export const listProspects = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(workbenchProjectSchema)
  .handler(({ context }) => WorkbenchService.listProspects(context.projectId));
export const saveProspect = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveProspectSchema)
  .handler(({ data, context }) =>
    WorkbenchService.saveProspect({ ...data, projectId: context.projectId }),
  );
export const updateProspectStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProspectStatusSchema)
  .handler(({ data, context }) =>
    WorkbenchService.updateProspectStatus(
      context.projectId,
      data.prospectId,
      data.status,
      data.note,
    ),
  );
export const recheckProspect = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(prospectRefSchema)
  .handler(({ data, context }) =>
    WorkbenchService.recheckProspect(context.projectId, data.prospectId),
  );
export const listProspectEvents = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(prospectRefSchema)
  .handler(({ data, context }) =>
    WorkbenchService.listProspectEvents(context.projectId, data.prospectId),
  );
export const discoverProspects = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(discoverProspectsSchema)
  .handler(({ data, context }) =>
    WorkbenchService.discoverProspects(
      context.projectId,
      data.targetUrl,
      context,
    ),
  );

export const getDiscoverySettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(workbenchProjectSchema)
  .handler(({ context }) =>
    WorkbenchDiscoveryService.getSettings(context.projectId),
  );
export const saveDiscoverySettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(discoverySettingsSchema)
  .handler(({ data, context }) =>
    WorkbenchDiscoveryService.saveSettings(
      { ...data, projectId: context.projectId },
      context,
    ),
  );
