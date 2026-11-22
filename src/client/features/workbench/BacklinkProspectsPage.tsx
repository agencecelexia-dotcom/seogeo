import { ProspectDetails } from "./ProspectDetails";
import { DiscoveryDialog } from "./DiscoveryDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Download, Plus, Search } from "lucide-react";

import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Input } from "@/client/components/ui/input";

import { buildCsv } from "@/client/lib/csv";
import { downloadFile } from "@/client/lib/download";
import { listProspects } from "@/serverFunctions/workbench";
import type { BacklinkProspect } from "@/server/features/workbench/WorkbenchRepository";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
} from "@/types/schemas/workbench";
import { DiscoverySchedule } from "./DiscoverySchedule";
import { ProspectForm } from "./ProspectForm";
import { dateLabel, workbenchKeys } from "./shared";

const checkLabels = {
  unchecked: "Non vérifié",
  present: "Lien présent",
  missing: "Lien non trouvé",
  error: "Contrôle impossible",
} as const;

export function BacklinkProspectsPage({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [discovery, setDiscovery] = useState(false);
  const [selected, setSelected] = useState<BacklinkProspect | null>(null);
  const [editing, setEditing] = useState<BacklinkProspect | undefined>();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: workbenchKeys.prospects(projectId),
    queryFn: () => listProspects({ data: { projectId } }),
  });
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["workbench", projectId] });
    await client.invalidateQueries({ queryKey: ["portfolio"] });
  };
  return (
    <div className="overflow-auto px-4 py-6 pb-24 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Prospects backlinks"
          description="Qualifier des opportunités, préparer les contacts et vérifier les liens obtenus."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDiscovery(true)}>
                <Search className="size-4" />
                Depuis les concurrents
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Ajouter un prospect
              </Button>
            </div>
          }
        />
        <DiscoverySchedule projectId={projectId} />
        <QueryState
          query={query}
          errorFallback="Impossible de charger les prospects."
        >
          {({ prospects, truncated }) => {
            const visible = prospects.filter(
              (p) =>
                (filter === "all" || p.status === filter) &&
                `${p.sourceUrl} ${p.targetUrl} ${p.reason}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            );
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    [
                      "À qualifier",
                      prospects.filter((p) => p.status === "discovered").length,
                    ],
                    [
                      "À contacter",
                      prospects.filter(
                        (p) =>
                          p.status === "qualified" || p.status === "to_contact",
                      ).length,
                    ],
                    [
                      "Liens acquis",
                      prospects.filter((p) => p.status === "acquired").length,
                    ],
                  ].map(([label, count]) => (
                    <div key={label} className="rounded-xl border bg-card p-4">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-1 text-2xl font-semibold">{count}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    aria-label="Rechercher un prospect"
                    className="max-w-sm"
                    placeholder="Rechercher une page ou un motif"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    aria-label="Filtrer par statut"
                    className="h-10 rounded-lg border bg-background px-3 text-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Tous les statuts</option>
                    {PROSPECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PROSPECT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={!visible.length}
                    onClick={() =>
                      downloadFile(
                        buildCsv(
                          [
                            "Source",
                            "Cible",
                            "Motif",
                            "Statut",
                            "Contact",
                            "Email",
                            "Source du contact",
                            "Brouillon",
                            "Contrôle HTML",
                            "Dernier contrôle",
                          ],
                          visible.map((p) => [
                            p.sourceUrl,
                            p.targetUrl,
                            p.reason,
                            PROSPECT_STATUS_LABELS[p.status],
                            p.contactName,
                            p.contactEmail,
                            p.contactSourceUrl,
                            p.draft,
                            checkLabels[p.checkStatus],
                            p.lastCheckedAt,
                          ]),
                        ),
                        "prospects-backlinks.csv",
                        "text/csv",
                      )
                    }
                  >
                    <Download className="size-4" />
                    Exporter
                  </Button>
                </div>
                {truncated ? (
                  <p className="text-sm text-muted-foreground">
                    Les 500 prospects les plus récents sont affichés ; les
                    compteurs et l’export portent sur cette sélection.
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-4">Source et cible</th>
                        <th className="p-4">Statut</th>
                        <th className="p-4">Contrôle</th>
                        <th className="p-4">Dernier contrôle</th>
                        <th className="p-4">
                          <span className="sr-only">Détails</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="max-w-lg p-4">
                            <p className="truncate font-medium">
                              {p.sourceUrl}
                            </p>
                            <p className="mt-1 truncate text-muted-foreground">
                              Cible : {p.targetUrl}
                            </p>
                          </td>
                          <td className="p-4">
                            {PROSPECT_STATUS_LABELS[p.status]}
                          </td>
                          <td className="p-4">
                            <Badge
                              className="h-auto text-sm"
                              variant={
                                p.checkStatus === "present"
                                  ? "success"
                                  : p.checkStatus === "error"
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {checkLabels[p.checkStatus]}
                            </Badge>
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {dateLabel(p.lastCheckedAt)}
                          </td>
                          <td className="p-4">
                            <Button
                              variant="ghost"
                              onClick={() => setSelected(p)}
                            >
                              Ouvrir
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length ? (
                    <div className="p-10 text-center">
                      <p className="font-medium">
                        Aucun prospect dans cette sélection.
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Recherchez les pages qui citent vos concurrents, ou
                        enregistrez une opportunité sourcée.
                      </p>
                    </div>
                  ) : null}
                </div>
              </>
            );
          }}
        </QueryState>
      </div>
      {creating || editing ? (
        <ProspectForm
          projectId={projectId}
          prospect={editing}
          onClose={() => {
            setCreating(false);
            setEditing(undefined);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(undefined);
            void invalidate();
          }}
        />
      ) : null}
      {selected && !editing ? (
        <ProspectDetails
          key={selected.id}
          prospect={
            query.data?.prospects.find((p) => p.id === selected.id) ?? selected
          }
          onClose={() => setSelected(null)}
          onEdit={() =>
            setEditing(
              query.data?.prospects.find((p) => p.id === selected.id) ??
                selected,
            )
          }
          onChanged={invalidate}
        />
      ) : null}
      {discovery ? (
        <DiscoveryDialog
          projectId={projectId}
          onClose={() => setDiscovery(false)}
          onChanged={invalidate}
        />
      ) : null}
    </div>
  );
}
