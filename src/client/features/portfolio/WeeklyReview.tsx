import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { getWeeklyReview } from "@/serverFunctions/weeklyReview";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { buildCsv } from "@/client/lib/csv";
import { downloadFile } from "@/client/lib/download";
import { dateLabel } from "@/client/features/workbench/shared";

type Review = Awaited<ReturnType<typeof getWeeklyReview>>;
const markdownText = (value: string) =>
  value.replace(/[\\`*_{}[\]()<>#+!|]/g, "\\$&").replace(/\r?\n/g, " ");
function markdown(review: Review) {
  const lines = [
    "# Revue SEO / GEO privée",
    `Période UTC : ${review.periodStart} — ${review.periodEnd}`,
    `Générée le : ${review.generatedAt}`,
    "",
    review.interpretation,
    review.limited
      ? "Sélection limitée à 500 éléments par source et 20 priorités."
      : "",
    "## Priorités actuelles",
    ...review.priorities.map(
      (row) =>
        `- ${markdownText(row.projectName)} : ${markdownText(row.title)} (${markdownText(row.pageUrl)}) — ${markdownText(row.recommendation)}. Preuve : ${markdownText(row.evidenceText)}. Mis à jour : ${row.updatedAt}`,
    ),
    "",
    "## Couverture actuelle",
    ...review.coverage.map(
      ({ projectName, state }) =>
        `- ${markdownText(projectName)} / ${state.source} : données rafraîchies jusqu’au ${state.refreshedThrough ?? "inconnu"}, dernière mise à jour ${state.updatedAt}.`,
    ),
    "",
    "## Activité de la période",
    ...review.activity.map(
      (row) =>
        `- ${row.occurredAt} · Référence ${row.id} · ${markdownText(row.projectName)} · ${row.category} · ${markdownText(row.title)} : ${markdownText(row.detail)}${row.url ? ` (${markdownText(row.url)})` : ""}`,
    ),
  ];
  return lines.join("\n");
}
function csv(review: Review) {
  const rows = [
    ...review.activity.map((row) => [
      row.category,
      row.projectName,
      row.occurredAt,
      row.title,
      row.detail,
      row.url,
    ]),
    ...review.priorities.map((row) => [
      "Priorité actuelle",
      row.projectName,
      row.updatedAt,
      row.title,
      `${row.recommendation} Preuve : ${row.evidenceText}`,
      row.pageUrl,
    ]),
    ...review.coverage.map(({ projectName, state }) => [
      "Couverture actuelle",
      projectName,
      state.updatedAt,
      state.source,
      `Rafraîchi jusqu’au ${state.refreshedThrough ?? "inconnu"}`,
      "",
    ]),
  ];
  return buildCsv(
    [
      "Période début UTC",
      "Période fin UTC",
      "Catégorie",
      "Site",
      "Horodatage source",
      "Titre",
      "Détail",
      "URL",
    ],
    rows.map((row) => [review.periodStart, review.periodEnd, ...row]),
  );
}
export function WeeklyReview() {
  const query = useQuery({
    queryKey: ["portfolio", "weekly-review"],
    queryFn: () => getWeeklyReview(),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Revue des sept derniers jours</h2>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
          Actualiser
        </Button>
      </div>
      <QueryState
        query={query}
        errorFallback="Impossible de produire la revue."
      >
        {(review) => (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Du {dateLabel(review.periodStart)} au{" "}
              {dateLabel(review.periodEnd)}. {review.interpretation}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile(
                    markdown(review),
                    `revue-seo-${review.periodEnd.slice(0, 10)}.md`,
                    "text/markdown",
                  )
                }
              >
                <Download className="size-4" />
                Markdown
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile(
                    csv(review),
                    `revue-seo-${review.periodEnd.slice(0, 10)}.csv`,
                    "text/csv",
                  )
                }
              >
                <Download className="size-4" />
                CSV
              </Button>
            </div>
            {review.limited ? (
              <p className="text-sm text-muted-foreground">
                Sélection limitée à 500 éléments par source et 20 priorités.
              </p>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium">
                  Prochaines priorités hautes
                </h3>
                {review.priorities.length ? (
                  <ul className="space-y-2">
                    {review.priorities.map((row) => (
                      <li key={row.id} className="text-sm">
                        <Link
                          className="underline underline-offset-4"
                          to="/p/$projectId/actions"
                          params={{ projectId: row.projectId }}
                        >
                          {row.projectName} · {row.title}
                        </Link>
                        <p className="mt-1 text-muted-foreground">
                          {row.recommendation}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune action haute en attente enregistrée.
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-medium">Couverture des sources</h3>
                {review.coverage.length ? (
                  <ul className="space-y-2">
                    {review.coverage.map(({ projectName, state }) => (
                      <li key={state.id} className="text-sm">
                        {projectName} · {state.source} : jusqu’au{" "}
                        {state.refreshedThrough ?? "date inconnue"}
                        <p className="text-muted-foreground">
                          Mise à jour : {dateLabel(state.updatedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune collecte Google enregistrée.
                  </p>
                )}
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Consulter les {review.activity.length} opérations de la période
              </summary>
              <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto">
                {review.activity.map((row) => (
                  <li
                    key={`${row.category}:${row.id}`}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {row.projectName} · {row.category} · {row.title}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {dateLabel(row.occurredAt)} — {row.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </QueryState>
    </section>
  );
}
