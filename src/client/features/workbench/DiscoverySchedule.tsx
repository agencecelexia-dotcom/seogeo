import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { QueryState } from "@/client/components/QueryState";
import {
  getDiscoverySettings,
  saveDiscoverySettings,
} from "@/serverFunctions/workbench";
import { dateLabel } from "./shared";

export function DiscoverySchedule({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["workbench", projectId, "discovery"],
    queryFn: () => getDiscoverySettings({ data: { projectId } }),
  });
  return (
    <QueryState
      query={query}
      errorFallback="Impossible de charger la planification."
    >
      {(settings) => (
        <ScheduleForm
          key={`${settings?.updatedAt ?? "new"}:${projectId}`}
          projectId={projectId}
          settings={settings}
        />
      )}
    </QueryState>
  );
}
function ScheduleForm({
  projectId,
  settings,
}: {
  projectId: string;
  settings: Awaited<ReturnType<typeof getDiscoverySettings>>;
}) {
  const client = useQueryClient();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [targetUrl, setTargetUrl] = useState(settings?.targetUrl ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      saveDiscoverySettings({ data: { projectId, enabled, targetUrl } }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["workbench", projectId, "discovery"],
      });
      toast.success("Planification enregistrée.");
    },
  });
  return (
    <section className="rounded-xl border bg-card p-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div>
          <h2 className="font-semibold">Recherche mensuelle</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Configure les concurrents et la page à proposer, puis active la
            collecte. Elle cherche jusqu’à 100 liens par concurrent, pour les
            trois premiers concurrents. Le budget DataForSEO du projet
            s’applique. Les brouillons restent à valider et à envoyer
            manuellement.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid grow gap-2 text-sm font-medium">
            Page à proposer
            <Input
              type="url"
              required
              placeholder="https://monsite.fr/ressource"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
            />
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Activer chaque mois
          </label>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {settings?.enabled
            ? `Prochaine collecte : ${dateLabel(settings.nextRunAt)}. `
            : "Collecte automatique désactivée. "}
          {settings?.lastRunAt
            ? `Dernier passage : ${dateLabel(settings.lastRunAt)}. ${settings.lastOutcome ?? ""}`
            : "La première collecte aura lieu au prochain passage du planificateur après activation."}
        </p>
        <Link
          className="text-sm underline underline-offset-4"
          to="/p/$projectId/settings/context"
          params={{ projectId }}
        >
          Configurer les concurrents du projet
        </Link>
      </form>
    </section>
  );
}
