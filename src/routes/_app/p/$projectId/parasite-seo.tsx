import { createFileRoute } from "@tanstack/react-router";
import { ParasiteSeoPage } from "@/client/features/external-publications/ParasiteSeoPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/parasite-seo")({
  head: () => pageHead("Parasite SEO"),
  component: ParasiteSeoRoute,
});

function ParasiteSeoRoute() {
  const { projectId } = Route.useParams();
  return <ParasiteSeoPage key={projectId} projectId={projectId} />;
}
