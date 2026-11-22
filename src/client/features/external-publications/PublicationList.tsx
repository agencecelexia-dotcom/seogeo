import { useState } from "react";
import { Download, ExternalLink, FileText, Pencil } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Input } from "@/client/components/ui/input";
import { downloadFile } from "@/client/lib/download";
import {
  EXTERNAL_PUBLICATION_STATUSES,
  EXTERNAL_PUBLICATION_STATUS_LABELS,
  EXTERNAL_PUBLICATION_LINK_POLICY_LABELS,
  type ExternalPublication,
} from "@/types/schemas/external-publications";
import { methodById } from "./catalog";
import { publicationMarkdown, publicationsCsv } from "./exports";

export function PublicationList({
  publications,
  truncated,
  onEdit,
  onChooseMethod,
}: {
  publications: ExternalPublication[];
  truncated: boolean;
  onEdit: (publication: ExternalPublication) => void;
  onChooseMethod: () => void;
}) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const visible = publications.filter(
    (p) =>
      (status === "all" || p.status === status) &&
      `${p.title} ${p.platformName} ${p.targetKeyword} ${p.targetUrl}`
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="sm:max-w-sm"
          aria-label="Rechercher une publication"
          placeholder="Sujet, support ou titre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          aria-label="Filtrer les publications par statut"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Tous les statuts</option>
          {EXTERNAL_PUBLICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {EXTERNAL_PUBLICATION_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={!visible.length}
          onClick={() =>
            downloadFile(
              publicationsCsv(visible),
              "parasite-seo-publications.csv",
              "text/csv",
            )
          }
        >
          <Download className="size-4" />
          Exporter CSV
        </Button>
        <p className="text-sm text-muted-foreground">
          {visible.length} fiche{visible.length > 1 ? "s" : ""}
        </p>
      </div>
      {truncated && (
        <p className="text-sm text-muted-foreground">
          Les 200 fiches les plus récentes sont affichées. Les filtres et
          l’export portent sur cette sélection.
        </p>
      )}
      {!visible.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
          <FileText className="mx-auto size-7 text-muted-foreground" />
          <h2 className="font-semibold">
            {publications.length
              ? "Aucune publication ne correspond à ces filtres."
              : "Votre première publication commence par un angle utile."}
          </h2>
          <p className="text-sm text-muted-foreground">
            Choisissez une méthode, adaptez le brief et suivez votre contenu
            jusqu’à sa publication.
          </p>
          <Button variant="outline" onClick={onChooseMethod}>
            Choisir une méthode
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((p) => (
            <article
              key={p.id}
              className="min-w-0 rounded-xl border bg-card p-5 space-y-4"
              aria-labelledby={`publication-${p.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {methodById(p.strategyId).title}
                  </p>
                  <h2
                    id={`publication-${p.id}`}
                    className="mt-1 break-words text-base font-semibold"
                  >
                    {p.title}
                  </h2>
                </div>
                <Badge
                  className="shrink-0"
                  variant={p.status === "published" ? "success" : "secondary"}
                >
                  {EXTERNAL_PUBLICATION_STATUS_LABELS[p.status]}
                </Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Support</dt>
                  <dd className="mt-1 break-words">
                    {p.supportUrl ? (
                      <a
                        href={p.supportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        {p.platformName}
                        <span className="sr-only"> (nouvel onglet)</span>
                      </a>
                    ) : (
                      p.platformName
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sujet</dt>
                  <dd className="mt-1 break-words">{p.targetKeyword}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Page de votre site</dt>
                  <dd className="mt-1 break-all">
                    <a
                      href={p.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      {p.targetUrl}
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  </dd>
                </div>
              </dl>
              {p.publishedUrl && (
                <a
                  className="inline-flex max-w-full items-center gap-2 text-sm font-medium underline underline-offset-4"
                  href={p.publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4 shrink-0" />
                  <span>
                    Ouvrir la publication
                    <span className="sr-only">
                      {" "}
                      : {p.title} (nouvel onglet)
                    </span>
                  </span>
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Lien : {EXTERNAL_PUBLICATION_LINK_POLICY_LABELS[p.linkPolicy]}{" "}
                (déclaré) · Indexation : à vérifier
                {p.publishedAt
                  ? ` · Publication déclarée le ${new Date(p.publishedAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`
                  : ""}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Lire le brief
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
                  {p.brief || "Aucun brief renseigné."}
                </p>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => onEdit(p)}
                  aria-label={`Modifier ${p.title}`}
                >
                  <Pencil className="size-4" />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    downloadFile(
                      publicationMarkdown(p),
                      `publication-${p.id}.md`,
                      "text/markdown",
                    )
                  }
                  aria-label={`Exporter le brief de ${p.title}`}
                >
                  <Download className="size-4" />
                  Brief Markdown
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <details className="rounded-xl border bg-card p-5 text-sm">
        <summary className="cursor-pointer font-semibold">
          Après publication : vérifications et mesure
        </summary>
        <div className="mt-4 space-y-3 text-muted-foreground">
          <p>
            Ouvrir la page et vérifier le contenu, l’URL cible, les attributs du
            lien (nofollow, sponsored, ugc) et les éventuelles directives
            noindex ou canonical. Consigner vos observations dans le brief.
          </p>
          <p>
            Suivre les lectures dans les statistiques du support, puis les
            visites référentes et les conversions sur votre site. Une
            publication déclarée ne prouve ni son indexation ni un gain de
            classement.
          </p>
          <p>
            Pour le GEO, conserver la date, le moteur, le prompt, le pays et
            l’URL exacte citée. Distinguer une mention de votre marque d’une
            citation de la page ; ces observations ne démontrent pas à elles
            seules l’effet de la publication.
          </p>
        </div>
      </details>
    </div>
  );
}
