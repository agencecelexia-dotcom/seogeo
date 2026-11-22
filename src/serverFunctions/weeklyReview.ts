import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import { WeeklyReviewService } from "@/server/features/portfolio/WeeklyReviewService";

export const getWeeklyReview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    WeeklyReviewService.generate(context.organizationId),
  );
