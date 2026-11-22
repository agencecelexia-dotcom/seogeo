import { createFileRoute } from "@tanstack/react-router";
import { PortfolioPage } from "@/client/features/portfolio/PortfolioPage";
import { pageHead } from "@/client/lib/pageHead";
export const Route = createFileRoute("/_app/")({
  head: () => pageHead("Vue d’ensemble"),
  component: PortfolioPage,
});
