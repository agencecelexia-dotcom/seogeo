import { createFileRoute } from "@tanstack/react-router";
import { MonitoringPage } from "@/client/features/portfolio/MonitoringPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/monitoring")({
  head: () => pageHead("Collecte et budget"),
  component: MonitoringPage,
});
