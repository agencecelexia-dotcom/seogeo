import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/client/components/QueryState";
import { listImports } from "@/serverFunctions/imports";
import { IMPORT_SOURCE_LABELS } from "@/shared/data-imports";

export function ImportHistory({ projectId }: { projectId: string }) {
  const history = useQuery({
    queryKey: ["imports", projectId],
    queryFn: () => listImports({ data: { projectId } }),
    staleTime: 0,
  });
  return (
    <QueryState
      query={history}
      errorFallback="Impossible de charger les imports."
    >
      {(data) => (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Historique des imports</h2>
            {data.batches.length === 0 ? (
              <p className="text-muted-foreground">
                Aucun import pour ce site.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3">Source / fichier</th>
                      <th>Période</th>
                      <th>Lignes</th>
                      <th>Importé le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.batches.map((batch) => (
                      <tr key={batch.id} className="border-t">
                        <td className="p-3">
                          {IMPORT_SOURCE_LABELS[batch.source]}
                          <span className="block text-muted-foreground">
                            {batch.fileName}
                          </span>
                        </td>
                        <td className="pr-3">
                          {batch.periodStart} — {batch.periodEnd}
                        </td>
                        <td>{batch.rowCount}</td>
                        <td className="pr-3">
                          {new Date(batch.createdAt).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Les 30 imports les plus récents. Une observation réimportée avec
              les mêmes dimensions remplace sa valeur précédente.
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              Observations GEO importées
            </h2>
            <p className="text-sm text-muted-foreground">
              Jusqu’à 200 observations récentes. Pages, pays, appareils et
              périodes peuvent se recouvrir : ne pas additionner ces lignes. Ces
              exports ne sont pas les réponses du panel de questions.
            </p>
            {data.geo.length === 0 ? (
              <p className="text-muted-foreground">
                Aucune observation importée.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3">Source</th>
                      <th>Dimensions</th>
                      <th>Période</th>
                      <th className="pr-3">Mesure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.geo.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3">
                          {row.source === "gsc_generative"
                            ? "Google IA"
                            : "Bing IA"}
                        </td>
                        <td className="max-w-md break-words py-3 pr-4">
                          {row.pageUrl ? (
                            <a
                              href={row.pageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {row.pageUrl}
                            </a>
                          ) : null}
                          <span className="block">
                            {[row.query, row.country, row.device]
                              .filter(Boolean)
                              .join(" · ") ||
                              (!row.pageUrl ? "Total du rapport" : "")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap pr-4">
                          {row.periodStart}
                          <br />
                          {row.periodEnd}
                        </td>
                        <td className="pr-3">
                          {row.value.toLocaleString("fr-FR")}
                          <span className="block text-muted-foreground">
                            {row.metric}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Backlinks importés</h2>
            <p className="text-sm text-muted-foreground">
              Jusqu’à 200 liens récents. Leur présence est déclarée par le
              fichier ; elle n’a pas été revérifiée sur la page source.
            </p>
            {data.backlinks.length === 0 ? (
              <p className="text-muted-foreground">Aucun backlink importé.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3">Page source</th>
                      <th>Cible</th>
                      <th>Ancre / attributs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.backlinks.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="max-w-sm break-words p-3">
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {row.sourceUrl}
                          </a>
                        </td>
                        <td className="max-w-sm break-words pr-4">
                          <a
                            href={row.targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {row.targetUrl}
                          </a>
                        </td>
                        <td className="pr-3">
                          {row.anchor || "Non fourni"}
                          <span className="block text-muted-foreground">
                            {row.rel || "Attributs non fournis"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </QueryState>
  );
}
