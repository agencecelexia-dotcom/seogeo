import { createFileRoute } from "@tanstack/react-router";
import { ImportsPage } from "@/client/features/imports/ImportsPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/imports")({
  head: () => pageHead("Imports"),
  component: ImportRoute,
});

function ImportRoute() {
  const { projectId } = Route.useParams();
  return <ImportsPage key={projectId} projectId={projectId} />;
}
