import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "./middleware";

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => PortfolioService.overview(context.organizationId));
export const addInitialSites = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => {
    requireOrgPermission(context, { project: ["create"] });
    return PortfolioService.addInitialSites(context.organizationId);
  });
export const getPageEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ context }) =>
    PortfolioService.pageEvidence(context.organizationId, context.projectId),
  );
