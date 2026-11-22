import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { listExternalPublications } from "@/serverFunctions/externalPublications";
import type {
  ExternalPublication,
  ExternalPublicationStrategyId,
} from "@/types/schemas/external-publications";
import { MethodCatalog } from "./MethodCatalog";
import { PublicationList } from "./PublicationList";
import { PublicationForm } from "./PublicationForm";
import type { ResearchContext } from "./catalog";

export function ParasiteSeoPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string | number>("methods");
  const [context, setContext] = useState<ResearchContext>({
    keyword: "",
    sector: "",
    city: "",
  });
  const [editor, setEditor] = useState<{
    strategyId: ExternalPublicationStrategyId;
    publication?: ExternalPublication;
  } | null>(null);
  const projects = useQuery(projectsQueryOptions());
  const project = projects.data?.find((p) => p.id === projectId);
  const domain = project?.domain ?? "";
  const targetUrl = domain ? `https://${domain}` : "";
  const queryKey = ["external-publications", projectId];
  const query = useQuery({
    queryKey,
    queryFn: () => listExternalPublications({ data: { projectId } }),
  });
  function saved(publication: ExternalPublication) {
    queryClient.setQueryData<
      Awaited<ReturnType<typeof listExternalPublications>>
    >(queryKey, (previous) => {
      const publications = [
        publication,
        ...(previous?.publications ?? []).filter(
          (p) => p.id !== publication.id,
        ),
      ];
      return {
        publications: publications.slice(0, 200),
        truncated: Boolean(previous?.truncated || publications.length > 200),
      };
    });
    void queryClient.invalidateQueries({ queryKey });
    setEditor(null);
    setTab("publications");
  }
  return (
    <div className="h-full overflow-auto px-4 py-6 pb-24 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Parasite SEO"
          description="Choisir des supports externes, préparer des contenus utiles et suivre vos publications."
          actions={
            <Button onClick={() => setEditor({ strategyId: "guest_article" })}>
              <Plus className="size-4" />
              Nouvelle publication
            </Button>
          }
        />
        <div className="rounded-xl border bg-card p-5 text-sm leading-relaxed">
          <p>
            Choisissez un site pour ses lecteurs et sa pertinence éditoriale.
            L’autorité d’un domaine ne garantit ni classement ni indexation ;
            Google peut évaluer une section séparément.{" "}
            <a
              className="underline underline-offset-4"
              href="https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse"
              target="_blank"
              rel="noopener noreferrer"
            >
              Consulter la politique Google
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            .
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 h-10">
            <TabsTrigger value="methods" className="px-4">
              7 méthodes
            </TabsTrigger>
            <TabsTrigger value="publications" className="px-4">
              Mes publications
              {query.data
                ? ` (${query.data.publications.length}${query.data.truncated ? "+" : ""})`
                : ""}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="methods">
            <MethodCatalog
              context={context}
              onContextChange={setContext}
              projectDomain={domain}
              onChoose={(strategyId) => setEditor({ strategyId })}
            />
          </TabsContent>
          <TabsContent value="publications">
            <QueryState
              query={query}
              errorFallback="Impossible de charger vos publications."
            >
              {(data) => (
                <PublicationList
                  {...data}
                  onChooseMethod={() => setTab("methods")}
                  onEdit={(publication) =>
                    setEditor({
                      strategyId: publication.strategyId,
                      publication,
                    })
                  }
                />
              )}
            </QueryState>
          </TabsContent>
        </Tabs>
        {editor && (
          <PublicationForm
            key={
              editor.publication
                ? `${editor.publication.id}:${editor.publication.revision}`
                : editor.strategyId
            }
            projectId={projectId}
            {...editor}
            context={context}
            targetUrl={targetUrl}
            onClose={() => setEditor(null)}
            onSaved={saved}
          />
        )}
      </div>
    </div>
  );
}
