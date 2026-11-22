import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/client/components/ui/button";
import { inspectPagePerformance } from "@/serverFunctions/performance";

const metric = (value: number | null, unit = "ms") =>
  value === null
    ? "Inconnu"
    : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

export function PagePerformance({
  projectId,
  url,
}: {
  projectId: string;
  url: string;
}) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const query = useQuery({
    queryKey: ["page-performance", projectId, url, strategy],
    queryFn: () =>
      inspectPagePerformance({ data: { projectId, url, strategy } }),
    enabled: false,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const data = query.data;
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h3 className="font-medium">Performance · PageSpeed et CrUX</h3>
      <p className="text-sm text-muted-foreground">
        Mesure à la demande. L’URL est transmise à Google pour analyser cette
        page publique.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Appareil
          <select
            className="rounded-md border bg-background px-2 py-1.5"
            value={strategy}
            onChange={(event) =>
              setStrategy(
                event.target.value === "desktop" ? "desktop" : "mobile",
              )
            }
          >
            <option value="mobile">Mobile</option>
            <option value="desktop">Ordinateur</option>
          </select>
        </label>
        <Button
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Analyse en cours…" : "Analyser la performance"}
        </Button>
      </div>
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Impossible d’analyser cette URL. Vérifiez qu’elle appartient au site
          et réessayez.
        </p>
      ) : null}
      {data ? (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="font-medium">Laboratoire · Lighthouse</h4>
            <p className="text-muted-foreground">
              Simulation ponctuelle{" "}
              {strategy === "mobile" ? "mobile" : "ordinateur"}. Les résultats
              peuvent varier.
            </p>
            {data.lab.status === "error" ? (
              <p>
                Analyse indisponible : quota, délai ou page inaccessible.
                Réessayez ultérieurement.
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-2">
                  <dt>Score performance</dt>
                  <dd>{metric(data.lab.performance, "/ 100")}</dd>
                  <dt>LCP</dt>
                  <dd>{metric(data.lab.lcp)}</dd>
                  <dt>CLS</dt>
                  <dd>{metric(data.lab.cls, "")}</dd>
                  <dt>TBT</dt>
                  <dd>{metric(data.lab.tbt)}</dd>
                </dl>
                <p className="text-xs text-muted-foreground">
                  Lighthouse {data.lab.version ?? "version inconnue"} ·{" "}
                  {data.lab.measuredAt ?? data.measuredAt}
                </p>
                {data.lab.finalUrl && data.lab.finalUrl !== data.url ? (
                  <p className="break-all text-xs">
                    Page finale après redirection : {data.lab.finalUrl}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Terrain · Chrome UX Report</h4>
            <p className="text-muted-foreground">
              75e percentile des utilisateurs Chrome éligibles de cette page,
              sur une fenêtre de 28 jours. Couverture partielle, sans
              remplacement par les données du domaine.
            </p>
            {data.field.status === "available" ? (
              <>
                <dl className="grid grid-cols-2 gap-2">
                  <dt>LCP p75</dt>
                  <dd>{metric(data.field.lcp)}</dd>
                  <dt>INP p75</dt>
                  <dd>{metric(data.field.inp)}</dd>
                  <dt>CLS p75</dt>
                  <dd>{metric(data.field.cls, "")}</dd>
                  <dt>TTFB p75</dt>
                  <dd>{metric(data.field.ttfb)}</dd>
                </dl>
                <p className="text-xs text-muted-foreground">
                  Période : {data.field.periodStart ?? "inconnue"} au{" "}
                  {data.field.periodEnd ?? "inconnue"}
                </p>
                {data.field.url !== data.url ? (
                  <p className="break-all text-xs">
                    URL normalisée par CrUX : {data.field.url}
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                {data.field.status === "not_configured"
                  ? "Données inconnues : configurer la clé CrUX dans les paramètres du serveur."
                  : data.field.status === "no_data"
                    ? "Données inconnues : CrUX ne dispose pas d’un échantillon publiable pour cette page et cet appareil."
                    : "Données inconnues : CrUX est momentanément indisponible ou la clé n’est pas autorisée."}
              </p>
            )}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Sources :{" "}
        <a
          href="https://developers.google.com/speed/docs/insights/v5/get-started"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Google PageSpeed Insights
        </a>{" "}
        ·{" "}
        <a
          href="https://developer.chrome.com/docs/crux/api"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Chrome UX Report
        </a>
        . Le TBT du laboratoire ne remplace pas l’INP réel.
      </p>
    </section>
  );
}
