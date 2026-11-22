import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/client/lib/pageHead";
import { BacklinkProspectsPage } from "@/client/features/workbench/BacklinkProspectsPage";

export const Route = createFileRoute("/_app/p/$projectId/prospects")({
  head: () => pageHead("Prospects backlinks"),
  component: function ProspectsRoute() {
    const { projectId } = Route.useParams();
    return <BacklinkProspectsPage projectId={projectId} />;
  },
});
