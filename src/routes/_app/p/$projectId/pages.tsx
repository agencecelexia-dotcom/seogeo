import { createFileRoute } from "@tanstack/react-router";
import { PagesPage } from "@/client/features/portfolio/PagesPage";
import { pageHead } from "@/client/lib/pageHead";
export const Route = createFileRoute("/_app/p/$projectId/pages")({
  head: () => pageHead("Pages"),
  component: Page,
});
function Page() {
  return <PagesPage projectId={Route.useParams().projectId} />;
}
