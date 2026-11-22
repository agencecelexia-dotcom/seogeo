import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { BudgetPanel } from "./BudgetPanel";
import { AuditSchedules } from "./AuditSchedules";
import {
  getMonitoringOverview,
  syncMonitoringProject,
  updateMonitoringSettings,
} from "@/serverFunctions/monitoring";

const euro = (micros: number) =>
  (micros / 1_000_000).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
    : "—";
const status: Record<string, string> = {
  success: "Collecté",
  empty: "Aucune ligne retournée",
  unconnected: "Non connecté",
  error: "Échec",
  running: "En cours",
  settled: "Comptabilisé",
  reserved: "Réservé",
  uncertain: "Coût à confirmer",
  settling: "Rapprochement en cours",
};
const coverage: Record<string, string> = {
  complete: "Réponse complète",
  google_top_rows: "Principales lignes Google",
  google_limited: "Limitation Google",
  partial_row_limit: "Limite de 1 000 pages atteinte",
  unknown: "Inconnue",
};

export function MonitoringPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["monitoring"],
    queryFn: () => getMonitoringOverview(),
    refetchInterval: 60_000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["monitoring"] });
  const onError = (error: Error) => toast.error(error.message);
  const setting = useMutation({
    mutationFn: (
      data: Parameters<typeof updateMonitoringSettings>[0]["data"],
    ) => updateMonitoringSettings({ data }),
    onSuccess: refresh,
    onError,
  });
  const sync = useMutation({
    mutationFn: (projectId: string) =>
      syncMonitoringProject({ data: { projectId } }),
    onSuccess: (result) => {
      toast.info(
        result.status === "synced"
          ? "Un jour collecté par source ; l’historique continue en arrière-plan."
          : result.status === "paused"
            ? "Activez la collecte pour synchroniser."
            : result.status === "running"
              ? "Une collecte est déjà en cours."
              : result.status === "current"
                ? "Les données disponibles sont déjà à jour."
                : "Aucune donnée collectée. Consultez le journal et les connexions Google.",
      );
      void refresh();
    },
    onError,
  });
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <PageHeader
        title="Collecte et budget"
        description="L’état des données, les plafonds mensuels et le journal des opérations."
      />
      <QueryState query={query} errorFallback="Impossible de charger le suivi.">
        {(data) => (
          <>
            <BudgetPanel data={data} />
            <AuditSchedules projects={data.projects} />
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Collecte Google</h2>
              <p className="text-sm text-muted-foreground">
                Actualisation quotidienne des 7 derniers jours disponibles, puis
                reprise progressive de l’historique jusqu’à 480 jours. Un jour
                par source est traité à chaque passage du planificateur. Les
                quotas, la rétention et les restrictions de Google peuvent
                limiter la couverture.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.projects.map((project) => {
                  const config = data.monitoring.settings.find(
                    (row) => row.projectId === project.id,
                  );
                  return (
                    <article
                      key={project.id}
                      className="space-y-3 rounded-xl border bg-card p-5"
                    >
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {project.domain}
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={config?.enabled ?? false}
                          disabled={setting.isPending}
                          onChange={(event) =>
                            setting.mutate({
                              projectId: project.id,
                              enabled: event.target.checked,
                              backfillDays: config?.backfillDays ?? 480,
                            })
                          }
                        />{" "}
                        Collecte automatique activée
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Prochain passage : {date(config?.nextRunAt ?? null)}{" "}
                        (Paris)
                      </p>
                      <div className="flex flex-wrap items-center gap-4">
                        <Button
                          variant="outline"
                          disabled={sync.isPending || !config?.enabled}
                          onClick={() => sync.mutate(project.id)}
                        >
                          Collecter maintenant
                        </Button>
                        <Link
                          to="/p/$projectId/settings/integrations"
                          params={{ projectId: project.id }}
                          className="text-sm text-primary underline"
                        >
                          Connexions Google
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!data.projects.length ? (
                <p className="rounded-lg border p-5 text-sm text-muted-foreground">
                  Ajoutez un site depuis la vue d’ensemble pour commencer.
                </p>
              ) : null}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Journal des collectes</h2>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {[
                        "Date (Paris)",
                        "Site",
                        "Source / jour",
                        "État",
                        "Lignes",
                        "Couverture",
                      ].map((label) => (
                        <th
                          key={label}
                          className="whitespace-nowrap p-3 font-medium"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monitoring.runs.map((run) => (
                      <tr key={run.id} className="border-t">
                        <td className="whitespace-nowrap p-3">
                          {date(run.startedAt)}
                        </td>
                        <td className="p-3">
                          {data.projects.find(
                            (project) => project.id === run.projectId,
                          )?.name ?? "Site archivé"}
                        </td>
                        <td className="p-3">
                          {run.source.toUpperCase()} · {run.startDate}
                          <span className="block text-xs text-muted-foreground">
                            {run.sourceTimeZone}
                          </span>
                        </td>
                        <td className="p-3">
                          {status[run.status] ?? run.status}
                          {run.errorCode ? (
                            <span className="block text-xs text-muted-foreground">
                              {run.errorCode}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {run.status === "success" || run.status === "empty"
                            ? run.rowCount
                            : "—"}
                        </td>
                        <td className="p-3">
                          {coverage[run.coverage] ?? run.coverage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.monitoring.runs.length ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    Aucune collecte effectuée.
                  </p>
                ) : null}
              </div>
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Journal des coûts</h2>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {[
                        "Date (Paris)",
                        "Fournisseur",
                        "Opération",
                        "État",
                        "Plafond réservé (€)",
                        "Coût rapporté (USD)",
                      ].map((label) => (
                        <th
                          key={label}
                          className="whitespace-nowrap p-3 font-medium"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.budget.reservations.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="whitespace-nowrap p-3">
                          {date(row.createdAt)}
                        </td>
                        <td className="p-3">{row.provider}</td>
                        <td className="p-3">{row.operation}</td>
                        <td className="p-3">
                          {status[row.status] ?? row.status}
                        </td>
                        <td className="p-3">{euro(row.reservedMicros)}</td>
                        <td className="p-3">
                          {row.actualUsd === null
                            ? "À confirmer"
                            : row.actualUsd.toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.budget.reservations.length ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    Aucune opération payante enregistrée.
                  </p>
                ) : null}
              </div>
            </section>
          </>
        )}
      </QueryState>
    </main>
  );
}
