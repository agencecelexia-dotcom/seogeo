import { ActionDetails } from "./ActionDetails";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Download, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Input } from "@/client/components/ui/input";

import { buildCsv } from "@/client/lib/csv";
import { downloadFile } from "@/client/lib/download";
import { importAuditActions, listActions } from "@/serverFunctions/workbench";
import type { WorkbenchAction } from "@/server/features/workbench/WorkbenchRepository";
import {
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/types/schemas/workbench";
import { ActionForm } from "./ActionForm";
import { dateLabel, workbenchKeys } from "./shared";

export function WorkbenchActionsPage({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<WorkbenchAction | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: workbenchKeys.actions(projectId),
    queryFn: () => listActions({ data: { projectId } }),
  });
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["workbench", projectId] });
    await client.invalidateQueries({ queryKey: ["portfolio"] });
  };
  const auditImport = useMutation({
    mutationFn: () => importAuditActions({ data: { projectId } }),
    onSuccess: async (result) => {
      toast.success(
        result.auditId
          ? `${result.added} action(s) ajoutée(s) depuis l’audit.${result.truncated ? " Import limité à 500 anomalies." : ""}`
          : "Aucun audit terminé disponible.",
      );
      await invalidate();
    },
  });
  return (
    <div className="overflow-auto px-4 py-6 pb-24 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Actions"
          description="Des constats sourcés, une correction précise et un contrôle après réalisation."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => auditImport.mutate()}
                disabled={auditImport.isPending}
              >
                <RefreshCw className="size-4" />
                {auditImport.isPending
                  ? "Import en cours…"
                  : "Depuis le dernier audit"}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Nouvelle action
              </Button>
            </div>
          }
        />
        <QueryState
          query={query}
          errorFallback="Impossible de charger les actions."
        >
          {({ actions, truncated }) => {
            const visible = actions.filter(
              (action) =>
                (filter === "all" || action.status === filter) &&
                `${action.title} ${action.pageUrl}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            );
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    [
                      "À entreprendre",
                      actions.filter(
                        (a) => a.status === "todo" || a.status === "planned",
                      ).length,
                    ],
                    [
                      "À vérifier",
                      actions.filter((a) => a.status === "done").length,
                    ],
                    [
                      "Vérifiées",
                      actions.filter((a) => a.status === "verified").length,
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
                    aria-label="Rechercher une action"
                    placeholder="Rechercher une action ou une URL"
                    className="max-w-sm"
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
                    {ACTION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ACTION_STATUS_LABELS[status]}
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
                            "Titre",
                            "Page",
                            "Preuve",
                            "Constat",
                            "Correction",
                            "Priorité",
                            "Statut",
                            "Réalisée",
                            "Vérifiée",
                          ],
                          visible.map((a) => [
                            a.title,
                            a.pageUrl,
                            a.evidenceUrl,
                            a.evidenceText,
                            a.recommendation,
                            PRIORITY_LABELS[a.priority],
                            ACTION_STATUS_LABELS[a.status],
                            a.completedAt,
                            a.verifiedAt,
                          ]),
                        ),
                        "actions-seogeo.csv",
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
                    Les 500 actions les plus récentes sont affichées ; les
                    compteurs et l’export portent sur cette sélection.
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-4">Priorité</th>
                        <th className="p-4">Action et page</th>
                        <th className="p-4">Statut</th>
                        <th className="p-4">Mise à jour</th>
                        <th className="p-4">
                          <span className="sr-only">Détails</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((action) => (
                        <tr key={action.id} className="border-t">
                          <td className="p-4">
                            <Badge
                              className="h-auto text-sm"
                              variant={
                                action.priority === "high"
                                  ? "warning"
                                  : "secondary"
                              }
                            >
                              {PRIORITY_LABELS[action.priority]}
                            </Badge>
                          </td>
                          <td className="max-w-lg p-4">
                            <p className="font-medium">{action.title}</p>
                            <p className="mt-1 truncate text-muted-foreground">
                              {action.pageUrl}
                            </p>
                          </td>
                          <td className="p-4">
                            {ACTION_STATUS_LABELS[action.status]}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {dateLabel(action.updatedAt)}
                          </td>
                          <td className="p-4">
                            <Button
                              variant="ghost"
                              onClick={() => setSelected(action)}
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
                        Aucune action dans cette sélection.
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Importez les anomalies du dernier audit ou ajoutez un
                        constat.
                      </p>
                    </div>
                  ) : null}
                </div>
              </>
            );
          }}
        </QueryState>
      </div>
      {creating ? (
        <ActionForm
          projectId={projectId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void invalidate();
          }}
        />
      ) : null}
      {selected ? (
        <ActionDetails
          key={selected.id}
          action={
            query.data?.actions.find((a) => a.id === selected.id) ?? selected
          }
          onClose={() => setSelected(null)}
          onChanged={invalidate}
        />
      ) : null}
    </div>
  );
}
