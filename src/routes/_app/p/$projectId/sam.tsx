import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SamChat } from "@/client/features/sam/SamChat";
import { SamVercelNotice } from "@/client/features/sam/SamVercelNotice";
import { StatusScreen } from "@/client/components/StatusScreen";

const samSearchSchema = z.object({
  // Active session id. Omitted until a session is selected/created.
  s: z.string().optional(),
});

export const Route = createFileRoute("/_app/p/$projectId/sam")({
  validateSearch: samSearchSchema,
  component: SamRoute,
});

function SamRoute() {
  const { projectId } = Route.useParams();
  const { s } = Route.useSearch();
  if (import.meta.env.VITE_RUNTIME_PLATFORM === "vercel") {
    return (
      <StatusScreen size="lg">
        <SamVercelNotice />
      </StatusScreen>
    );
  }
  return <SamChat projectId={projectId} activeSessionId={s} />;
}
