import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ImportService } from "@/server/features/imports/ImportService";
import { importInputSchema } from "@/shared/data-imports";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";

export const listImports = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ context }) => ImportService.list(context.projectId));

export const previewImport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(importInputSchema)
  .handler(({ data, context }) => {
    if (!context.project.domain)
      throw new AppError(
        "VALIDATION_ERROR",
        "Configurer le domaine du site avant d’importer ses données.",
      );
    return ImportService.preview(
      { ...data, projectId: context.projectId },
      context.project.domain,
    );
  });

export const commitImport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(importInputSchema)
  .handler(async ({ data, context }) => {
    if (!context.project.domain)
      throw new AppError(
        "VALIDATION_ERROR",
        "Configurer le domaine du site avant d’importer ses données.",
      );
    try {
      return {
        ok: true as const,
        ...(await ImportService.commit(
          { ...data, projectId: context.projectId },
          context.project.domain,
          context.userId,
        )),
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "VALIDATION_ERROR")
        return { ok: false as const, message: error.message };
      throw error;
    }
  });
