import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import {
  listActionEvents,
  listProspectEvents,
} from "@/serverFunctions/workbench";
import { QueryState } from "@/client/components/QueryState";
import {
  ACTION_STATUS_LABELS,
  PROSPECT_STATUS_LABELS,
} from "@/types/schemas/workbench";

export const workbenchKeys = {
  actions: (projectId: string) => ["workbench", projectId, "actions"] as const,
  prospects: (projectId: string) =>
    ["workbench", projectId, "prospects"] as const,
  history: (projectId: string, id: string) =>
    ["workbench", projectId, "history", id] as const,
};
export function dateLabel(value: string | null) {
  if (!value) return "Non vérifié";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}
export function EvidenceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 break-all text-sm text-primary underline-offset-4 hover:underline"
    >
      <span>{url}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
export function WorkbenchHistory({
  projectId,
  actionId,
  prospectId,
}: {
  projectId: string;
  actionId?: string;
  prospectId?: string;
}) {
  const id = actionId ?? prospectId ?? "";
  const query = useQuery({
    queryKey: workbenchKeys.history(projectId, id),
    queryFn: () =>
      actionId
        ? listActionEvents({ data: { projectId, actionId } })
        : listProspectEvents({ data: { projectId, prospectId: id } }),
  });
  const labels: Record<string, string> = actionId
    ? ACTION_STATUS_LABELS
    : PROSPECT_STATUS_LABELS;
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">Historique</h3>
      <QueryState
        query={query}
        errorFallback="Impossible de charger l’historique."
      >
        {(events) => (
          <ol className="space-y-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="border-l-2 border-border pl-3 text-sm"
              >
                <p className="font-medium">
                  {labels[event.toStatus] ?? event.toStatus} ·{" "}
                  {dateLabel(event.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {event.note}
                </p>
              </li>
            ))}
            {events.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                Aucun événement enregistré.
              </li>
            ) : null}
          </ol>
        )}
      </QueryState>
    </section>
  );
}
