import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Globe2, Link2, ListTodo, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { QueryState } from "@/client/components/QueryState";
import { WeeklyReview } from "./WeeklyReview";
import { addInitialSites, getPortfolio } from "@/serverFunctions/portfolio";
import {
  ACTION_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/types/schemas/workbench";

export function PortfolioPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolio(),
    refetchInterval: 60_000,
  });
  const setup = useMutation({
    mutationFn: () => addInitialSites(),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["portfolio"] }),
        client.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success(
        `${result.created} site(s) ajouté(s). Connectez ensuite les sources.`,
      );
    },
    onError: () => toast.error("Impossible d’ajouter les sites. Réessayez."),
  });
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
      <PageHeader
        title="Vos sites, vos prochaines actions"
        description="SEO, visibilité IA et opportunités réunis. Chaque recommandation garde sa preuve."
        actions={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className="size-4" />
            Actualiser
          </Button>
        }
      />
      <QueryState
        query={query}
        errorFallback="Le cockpit n’a pas pu être chargé."
      >
        {(data) => {
          const sites = data.sites.filter((site) => site.domain);
          const openActions = sites.reduce(
            (n, site) => n + site.actions.length,
            0,
          );
          const acquired = sites.reduce(
            (n, site) =>
              n +
              Number(
                site.prospects.find((row) => row.status === "acquired")
                  ?.count ?? 0,
              ),
            0,
          );
          return (
            <>
              <section
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                aria-label="Résumé du portefeuille"
              >
                {[
                  { label: "Sites suivis", value: sites.length, icon: Globe2 },
                  {
                    label: "Actions en cours",
                    value: openActions,
                    icon: ListTodo,
                  },
                  {
                    label: "Search Console connecté",
                    value: `${sites.filter((site) => site.gsc).length}/${sites.length}`,
                    icon: CheckCircle2,
                  },
                  {
                    label: "Liens acquis suivis",
                    value: acquired,
                    icon: Link2,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border bg-card p-5"
                  >
                    <item.icon className="mb-4 size-5 text-primary" />
                    <p className="text-3xl font-semibold tabular-nums">
                      {item.value}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                ))}
              </section>
              {sites.length === 0 ? (
                <section className="rounded-xl border border-dashed bg-card p-8">
                  <h2 className="text-xl font-semibold">
                    Commencez par vos trois sites
                  </h2>
                  <p className="my-3 max-w-2xl text-muted-foreground">
                    Celexia, Rénovation Metbach et ArtisansFrance seront ajoutés
                    avec le marché France et la langue française. Aucun appel
                    payant ne sera lancé.
                  </p>
                  <Button
                    onClick={() => setup.mutate()}
                    disabled={setup.isPending}
                  >
                    {setup.isPending
                      ? "Ajout en cours…"
                      : "Ajouter mes trois sites"}
                  </Button>
                  <Link to="/projects" className="ml-4 text-sm underline">
                    Gérer un autre site
                  </Link>
                </section>
              ) : null}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">État des sites</h2>
                  <Link
                    to="/projects"
                    className="text-sm text-primary underline"
                  >
                    Gérer les sites
                  </Link>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {sites.map((site) => (
                    <article
                      key={site.id}
                      className="flex flex-col rounded-xl border bg-card p-5"
                    >
                      <div className="mb-4">
                        <Link
                          to="/p/$projectId"
                          params={{ projectId: site.id }}
                          className="text-lg font-semibold hover:underline"
                        >
                          {site.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {site.domain}
                        </p>
                      </div>
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Search Console
                          </dt>
                          <dd>{site.gsc ? "Connecté" : "À connecter"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Analytics</dt>
                          <dd>{site.ga4 ? "Connecté" : "À connecter"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Dernier audit
                          </dt>
                          <dd>
                            {site.audit
                              ? `${site.audit.pagesCrawled} pages · ${site.audit.status === "completed" ? "terminé" : site.audit.status === "failed" ? "échec" : "en cours"}`
                              : "Non mesuré"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Collecte GEO
                          </dt>
                          <dd>
                            {site.geoRun
                              ? site.geoRun.status === "completed"
                                ? "Dernier relevé terminé"
                                : site.geoRun.status
                              : "Aucun relevé"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Actions à suivre
                          </dt>
                          <dd className="font-semibold">
                            {site.actions.length}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm">
                        <Link
                          to="/p/$projectId/actions"
                          params={{ projectId: site.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          Actions
                        </Link>
                        <Link
                          to="/p/$projectId/pages"
                          params={{ projectId: site.id }}
                          className="hover:underline"
                        >
                          Pages
                        </Link>
                        <Link
                          to="/p/$projectId/settings/integrations"
                          params={{ projectId: site.id }}
                          className="hover:underline"
                        >
                          Sources
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">À traiter en priorité</h2>
                {data.priorities.length ? (
                  <div className="divide-y rounded-xl border bg-card">
                    {data.priorities.map((action) => (
                      <Link
                        key={action.id}
                        to="/p/$projectId/actions"
                        params={{ projectId: action.projectId }}
                        className="block p-4 hover:bg-muted/40"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {action.projectName}
                          </span>
                          <span
                            className={
                              action.priority === "high"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            Priorité{" "}
                            {PRIORITY_LABELS[action.priority].toLowerCase()}
                          </span>
                          <span className="text-muted-foreground">
                            {ACTION_STATUS_LABELS[action.status]}
                          </span>
                        </div>
                        <p className="font-medium">{action.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {action.evidenceText}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-6 text-muted-foreground">
                    Aucune action enregistrée. Lancez un audit depuis un site,
                    puis transformez ses constats en actions.
                  </div>
                )}
              </section>
              <WeeklyReview />
              <p className="text-sm text-muted-foreground">
                Ce cockpit lit les données enregistrées. Ouvrez « Collecte et
                budget » pour consulter les collectes, leurs limites et leurs
                dates. Une source absente ne vaut pas zéro.
              </p>
            </>
          );
        }}
      </QueryState>
    </main>
  );
}
