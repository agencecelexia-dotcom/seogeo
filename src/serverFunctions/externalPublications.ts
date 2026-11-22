import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { ExternalPublicationService } from "@/server/features/external-publications/ExternalPublicationService";
import {
  externalPublicationsProjectSchema,
  saveExternalPublicationSchema,
} from "@/types/schemas/external-publications";

export const listExternalPublications = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(externalPublicationsProjectSchema)
  .handler(({ context }) => ExternalPublicationService.list(context.projectId));
export const saveExternalPublication = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveExternalPublicationSchema)
  .handler(({ context, data }) =>
    ExternalPublicationService.save({
      ...data,
      projectId: context.projectId,
    }),
  );
