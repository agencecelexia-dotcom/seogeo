import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { commitImport, previewImport } from "@/serverFunctions/imports";
import {
  IMPORT_MAX_CHARS,
  IMPORT_MAX_ROWS,
  IMPORT_SOURCE_LABELS,
  importSourceSchema,
  type ImportInput,
  type ImportRow,
  type ImportSource,
} from "@/shared/data-imports";

import { ImportHistory } from "./ImportHistory";

const examples: Record<ImportSource, string> = {
  gsc_generative: "Pages,Impressions\nhttps://votre-site.fr/prestations,123\n",
  bing_ai: "Page URL,Total citations\nhttps://votre-site.fr/prestations,12\n",
  backlinks:
    "Source URL,Target URL,Anchor,Rel\nhttps://partenaire.fr/ressources,https://votre-site.fr/,Votre entreprise,nofollow\n",
};
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base";

function previewDescription(row: ImportRow) {
  return row.kind === "backlink"
    ? `${row.sourceUrl} → ${row.targetUrl}`
    : [row.pageUrl, row.query, row.country, row.device]
        .filter(Boolean)
        .join(" · ") || "Total du rapport";
}

export function ImportsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [source, setSource] = useState<ImportSource>("gsc_generative");
  const [fileName, setFileName] = useState("rapport.csv");
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [csv, setCsv] = useState("");
  const [inputAtPreview, setInputAtPreview] = useState<ImportInput | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: (input: ImportInput) => previewImport({ data: input }),
    onSuccess: (_result, input) => setInputAtPreview(input),
  });
  const save = useMutation({
    mutationFn: (input: ImportInput) => commitImport({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.duplicate
          ? "Ce fichier a déjà été importé."
          : `${result.rowCount} observations enregistrées.`,
      );
      setInputAtPreview(null);
      preview.reset();
      void queryClient.invalidateQueries({ queryKey: ["imports", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
  const resetPreview = () => {
    setInputAtPreview(null);
    preview.reset();
  };
  const input = { projectId, source, fileName, csv, periodStart, periodEnd };
  const previewMatches =
    inputAtPreview && JSON.stringify(inputAtPreview) === JSON.stringify(input);
  const ready =
    previewMatches &&
    preview.data &&
    preview.data.errors.length === 0 &&
    !preview.data.alreadyImported;

  return (
    <div className="h-full overflow-auto px-4 py-6 pb-24 md:px-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <PageHeader
          title="Importer des données"
          description="Réunissez les rapports disponibles en export. Leur source, leur période et leur granularité restent visibles."
        />
        <section
          className="rounded-xl border bg-card p-5 space-y-5"
          aria-labelledby="import-title"
        >
          <h2 id="import-title" className="text-lg font-semibold">
            Nouvel import CSV
          </h2>
          <p className="text-sm text-muted-foreground">
            CSV séparé par virgules, points-virgules ou tabulations. Maximum{" "}
            {IMPORT_MAX_ROWS.toLocaleString("fr-FR")} lignes et 1 Mo. Les
            exports Google et Bing restent des mesures distinctes ; leurs totaux
            ne sont pas additionnés.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              Source
              <select
                className={selectClass}
                value={source}
                onChange={(event) => {
                  setSource(importSourceSchema.parse(event.target.value));
                  resetPreview();
                }}
              >
                {Object.entries(IMPORT_SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Début de période
              <Input
                type="date"
                value={periodStart}
                onChange={(event) => {
                  setPeriodStart(event.target.value);
                  resetPreview();
                }}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Fin de période
              <Input
                type="date"
                value={periodEnd}
                onChange={(event) => {
                  setPeriodEnd(event.target.value);
                  resetPreview();
                }}
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Reprendre exactement la période du rapport exporté. Les dates de
            Google suivent son fuseau de reporting. Sans colonne Date, chaque
            ligne décrit toute cette période.
          </p>
          <label className="block space-y-2 text-sm font-medium">
            Fichier
            <Input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={async (event) => {
                resetPreview();
                setFileError(null);
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > IMPORT_MAX_CHARS) {
                  setFileError("Le fichier dépasse 1 Mo.");
                  return;
                }
                try {
                  setCsv(await file.text());
                  setFileName(file.name.slice(0, 200));
                } catch {
                  setFileError("Impossible de lire ce fichier.");
                }
              }}
            />
          </label>
          <details className="rounded-lg bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Voir les colonnes attendues
            </summary>
            <p className="py-2">
              Exemple de format uniquement : remplacer les URL par celles du
              site. Les en-têtes français usuels sont aussi reconnus.
            </p>
            <pre className="overflow-x-auto text-sm">{examples[source]}</pre>
          </details>
          <label className="block space-y-2 text-sm font-medium">
            Contenu CSV
            <Textarea
              className="min-h-40 font-mono"
              value={csv}
              maxLength={IMPORT_MAX_CHARS}
              onChange={(event) => {
                setCsv(event.target.value);
                resetPreview();
              }}
              placeholder="Coller le contenu ou choisir un fichier…"
            />
          </label>
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
          {preview.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getStandardErrorMessage(
                preview.error,
                "Impossible de préparer l’import.",
              )}
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getStandardErrorMessage(
                save.error,
                "Impossible d’enregistrer l’import.",
              )}
            </p>
          )}
          <Button
            disabled={
              !csv ||
              !periodStart ||
              !periodEnd ||
              preview.isPending ||
              save.isPending
            }
            onClick={() => preview.mutate(input)}
          >
            {preview.isPending ? "Vérification…" : "Prévisualiser"}
          </Button>
          {preview.data && previewMatches && (
            <div className="space-y-3 border-t pt-4">
              <p className="font-medium">
                {preview.data.validRows} lignes valides ·{" "}
                {preview.data.duplicates} doublons retirés
              </p>
              {preview.data.alreadyImported && (
                <p className="text-sm">
                  Ce contenu existe déjà dans ce projet. Aucune nouvelle donnée
                  ne sera créée.
                </p>
              )}
              {preview.data.errors.length > 0 && (
                <ul
                  role="alert"
                  className="list-disc pl-5 text-sm text-destructive"
                >
                  {preview.data.errors.map((error, index) => (
                    <li key={index}>
                      Ligne {error.row} : {error.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Aperçu des vingt premières observations
                  </caption>
                  <thead>
                    <tr className="border-b">
                      <th className="py-2">Observation</th>
                      <th>Valeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.rows.map((row) => (
                      <tr key={row.rowKey} className="border-b">
                        <td className="max-w-xl break-words py-2 pr-4">
                          {previewDescription(row)}
                        </td>
                        <td>
                          {row.kind === "geo"
                            ? `${row.value.toLocaleString("fr-FR")} ${row.metric}`
                            : row.anchor || "Lien"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                disabled={!ready || save.isPending}
                onClick={() => {
                  if (inputAtPreview) save.mutate(inputAtPreview);
                }}
              >
                {save.isPending ? "Enregistrement…" : "Confirmer l’import"}
              </Button>
            </div>
          )}
        </section>

        <ImportHistory projectId={projectId} />
      </div>
    </div>
  );
}
