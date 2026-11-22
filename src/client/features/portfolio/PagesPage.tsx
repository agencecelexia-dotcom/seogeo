import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Input } from "@/client/components/ui/input";
import { getPageEvidence } from "@/serverFunctions/portfolio";
import { PagePerformance } from "@/client/features/performance/PagePerformance";

const metric = (value: number | null) =>
  value === null ? "Non mesuré" : value.toLocaleString("fr-FR");
export function PagesPage({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["page-dossiers", projectId],
    queryFn: () => getPageEvidence({ data: { projectId } }),
  });
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <PageHeader
        title="Dossiers des pages"
        description="L’audit, les données Google et les preuves importées réunis par URL."
      />
      <QueryState
        query={query}
        errorFallback="Impossible de charger les pages."
      >
        {(data) => {
          const pages = data.pages.filter((page) =>
            `${page.url} ${page.title ?? ""}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
          );
          const active = data.pages.find((page) => page.url === selected);
          return (
            <>
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                <p>
                  Données Google collectées depuis le {data.since}. Les jours
                  disponibles sont indiqués par source ; clics GSC et sessions
                  GA4 ne sont pas additionnés.
                </p>
                <p className="mt-1">
                  {data.audit
                    ? `Audit HTML du ${data.audit.startedAt.slice(0, 10)} · ${data.audit.pagesCrawled} pages. L’indexabilité technique n’est pas une preuve d’indexation.`
                    : "Aucun audit terminé. Les pages peuvent néanmoins apparaître grâce aux données Google ou importées."}
                </p>
                {data.limited ? (
                  <p className="mt-2 font-medium text-amber-700 dark:text-amber-400">
                    Le dossier atteint une limite de lecture. Les chiffres
                    portent sur les lignes chargées.
                  </p>
                ) : null}
              </div>
              <label className="block max-w-lg space-y-2 text-sm">
                <span>Filtrer par URL ou titre</span>
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Ex. /prestations/"
                />
              </label>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {[
                        "Page",
                        "HTTP",
                        "Clics GSC",
                        "Impressions",
                        "Sessions GA4",
                        "Événements clés",
                        "Actions",
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
                    {pages.map((page) => (
                      <tr key={page.url} className="border-t hover:bg-muted/30">
                        <td className="max-w-sm p-3">
                          <button
                            type="button"
                            onClick={() => setSelected(page.url)}
                            className="block w-full truncate text-left font-medium text-primary hover:underline"
                          >
                            {page.title || page.url}
                          </button>
                          <span className="block truncate text-muted-foreground">
                            {page.url}
                          </span>
                        </td>
                        <td className="p-3">{page.statusCode ?? "—"}</td>
                        <td className="p-3 tabular-nums">
                          {metric(page.clicks)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {metric(page.impressions)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {metric(page.sessions)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {metric(page.keyEvents)}
                        </td>
                        <td className="p-3">{page.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!pages.length ? (
                  <p className="p-6 text-muted-foreground">
                    Aucune page disponible. Connectez Google, lancez un audit ou
                    importez un rapport.
                  </p>
                ) : null}
              </div>
              {active ? (
                <section className="space-y-4 rounded-xl border bg-card p-5">
                  <h2 className="break-all text-lg font-semibold">
                    {active.url}
                  </h2>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">
                        Indexabilité dans l’audit
                      </dt>
                      <dd>
                        {active.indexable === null
                          ? "Non vérifiée"
                          : active.indexable
                            ? "Techniquement indexable"
                            : "Obstacle détecté"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Canonical déclarée
                      </dt>
                      <dd className="break-all">
                        {active.canonical ?? "Non renseignée"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Couverture Google
                      </dt>
                      <dd>
                        {active.gscDays} jours GSC · {active.ga4Days} jours GA4
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Liens entrants importés
                      </dt>
                      <dd>{active.backlinks} observations enregistrées</dd>
                    </div>
                  </dl>
                  <h3 className="font-medium">Rapports GEO importés</h3>
                  {active.geo.length ? (
                    <ul className="space-y-2 text-sm">
                      {active.geo.map((geo, index) => (
                        <li key={index}>
                          {geo.source === "gsc_generative" ? "Google" : "Bing"}{" "}
                          · {geo.periodStart} au {geo.periodEnd} · {geo.value}{" "}
                          {geo.metric === "citations"
                            ? "citations"
                            : "impressions"}
                          {geo.country ? ` · ${geo.country}` : ""}
                          {geo.device ? ` · ${geo.device}` : ""}
                          {geo.query ? ` · ${geo.query}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucune observation importée pour cette URL.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Les rapports GEO ci-dessus restent séparés : des périodes ou
                    dimensions qui se chevauchent ne doivent pas être
                    additionnées.
                  </p>
                  <Link
                    to="/p/$projectId/actions"
                    params={{ projectId }}
                    className="text-sm font-medium text-primary underline"
                  >
                    Ouvrir les actions du site
                  </Link>
                  <PagePerformance
                    key={active.url}
                    projectId={projectId}
                    url={active.url}
                  />
                </section>
              ) : null}
            </>
          );
        }}
      </QueryState>
    </main>
  );
}
