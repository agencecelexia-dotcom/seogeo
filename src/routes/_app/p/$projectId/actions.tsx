import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/client/lib/pageHead";
import { WorkbenchActionsPage } from "@/client/features/workbench/WorkbenchActionsPage";

export const Route = createFileRoute("/_app/p/$projectId/actions")({
  head: () => pageHead("Actions"),
  component: function ActionsRoute() {
    const { projectId } = Route.useParams();
    return <WorkbenchActionsPage projectId={projectId} />;
  },
});
