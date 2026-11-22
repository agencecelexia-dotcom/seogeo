import { ExternalLink, FilePenLine, Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import type { ExternalPublicationStrategyId } from "@/types/schemas/external-publications";
import {
  googleSearchUrl,
  PUBLICATION_METHODS,
  searchQuery,
  type ResearchContext,
} from "./catalog";

export function MethodCatalog({
  context,
  onContextChange,
  onChoose,
  projectDomain,
}: {
  context: ResearchContext;
  onContextChange: (context: ResearchContext) => void;
  onChoose: (id: ExternalPublicationStrategyId) => void;
  projectDomain: string;
}) {
  return (
    <div className="space-y-5">
      <section
        className="rounded-xl border bg-card p-5 space-y-4"
        aria-labelledby="research-title"
      >
        <h2 id="research-title" className="font-semibold">
          Adapter les recherches à votre activité
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2 text-sm">
            Mot-clé ou sujet
            <Input
              value={context.keyword}
              maxLength={300}
              placeholder="Ex. audit énergétique"
              onChange={(e) =>
                onContextChange({ ...context, keyword: e.target.value })
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            Secteur ou métier
            <Input
              value={context.sector}
              maxLength={200}
              placeholder="Ex. rénovation"
              onChange={(e) =>
                onContextChange({ ...context, sector: e.target.value })
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            Ville ou zone
            <Input
              value={context.city}
              maxLength={150}
              placeholder="Ex. Lyon"
              onChange={(e) =>
                onContextChange({ ...context, city: e.target.value })
              }
            />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Les liens ci-dessous ouvrent une recherche Google. Examinez les
          résultats et choisissez les supports qui correspondent à vos lecteurs.
        </p>
        {projectDomain && (
          <a
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
            href={googleSearchUrl(
              `"${projectDomain}" ${context.keyword.trim()} -site:${projectDomain}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Search className="size-4" /> Rechercher les mentions de{" "}
            {projectDomain}
          </a>
        )}
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {PUBLICATION_METHODS.map((method, index) => (
          <article
            key={method.id}
            className="rounded-xl border bg-card p-5 space-y-4"
            aria-labelledby={`method-${method.id}`}
          >
            <div className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {index + 1}
              </span>
              <div>
                <h3 id={`method-${method.id}`} className="font-semibold">
                  {method.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {method.description}
                </p>
              </div>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {method.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="space-y-2">
              {method.queries.map((template) => {
                const query = searchQuery(template, context);
                return (
                  <a
                    key={template}
                    href={googleSearchUrl(query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-lg border bg-background p-3 text-sm hover:bg-muted/60"
                  >
                    <Search className="mt-0.5 size-4 shrink-0" />
                    <span className="break-words">{query}</span>
                    <ExternalLink className="mt-0.5 ml-auto size-3.5 shrink-0" />
                    <span className="sr-only">
                      (recherche Google, nouvel onglet)
                    </span>
                  </a>
                );
              })}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Vérifications, mesure et sources
              </summary>
              <div className="mt-3 space-y-3 text-muted-foreground">
                <p>{method.checks}</p>
                <p>
                  <span className="font-medium text-foreground">
                    À mesurer :{" "}
                  </span>
                  {method.measurement}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {method.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      {source.title}
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  ))}
                </div>
              </div>
            </details>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onChoose(method.id)}
            >
              <FilePenLine className="size-4" />
              Préparer cette méthode
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
