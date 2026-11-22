import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { PerformanceService } from "@/server/features/performance/PerformanceService";
import { AppError } from "@/server/lib/errors";

export const inspectPagePerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      url: z.string().url().max(4096),
      strategy: z.enum(["mobile", "desktop"]),
    }),
  )
  .handler(({ data, context }) => {
    if (!context.project.domain)
      throw new AppError("VALIDATION_ERROR", "Configurer le domaine du site.");
    return PerformanceService.inspect(data, context.project.domain);
  });
