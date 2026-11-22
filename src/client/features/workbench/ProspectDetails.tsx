import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";

import { Textarea } from "@/client/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

import {
  recheckProspect,
  updateProspectStatus,
} from "@/serverFunctions/workbench";
import type { BacklinkProspect } from "@/server/features/workbench/WorkbenchRepository";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
} from "@/types/schemas/workbench";

import { dateLabel, EvidenceLink, WorkbenchHistory } from "./shared";

const checkLabels = {
  unchecked: "Non vérifié",
  present: "Lien présent",
  missing: "Lien non trouvé",
  error: "Contrôle impossible",
} as const;
export function ProspectDetails({
  prospect,
  onClose,
  onEdit,
  onChanged,
}: {
  prospect: BacklinkProspect;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<ProspectStatus>(prospect.status);
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      updateProspectStatus({
        data: {
          projectId: prospect.projectId,
          prospectId: prospect.id,
          status,
          note,
        },
      }),
    onSuccess: async () => {
      setNote("");
      toast.success("Statut enregistré.");
      await onChanged();
    },
  });
  const recheck = useMutation({
    mutationFn: () =>
      recheckProspect({
        data: { projectId: prospect.projectId, prospectId: prospect.id },
      }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Contrôle enregistré.");
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fiche prospect</DialogTitle>
        </DialogHeader>
        <section className="space-y-2">
          <h3 className="font-medium">Page source</h3>
          <EvidenceLink url={prospect.sourceUrl} />
          <h3 className="font-medium">Page proposée</h3>
          <EvidenceLink url={prospect.targetUrl} />
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {prospect.reason}
          </p>
        </section>
        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Vérification du lien</h3>
          <p className="text-sm">
            {checkLabels[prospect.checkStatus]} ·{" "}
            {dateLabel(prospect.lastCheckedAt)}
          </p>
          <p className="text-sm text-muted-foreground">
            {prospect.checkDetail ?? "Aucun contrôle effectué."}
            {prospect.linkRel ? ` Attribut rel : ${prospect.linkRel}.` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Le contrôle porte sur le lien exact dans le HTML. Le statut de
            prospection reste sous ton contrôle.
          </p>
          <Button
            variant="outline"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            {recheck.isPending ? "Vérification…" : "Vérifier le lien"}
          </Button>
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">Contact et brouillon</h3>
          <p className="text-sm">
            {[prospect.contactName, prospect.contactEmail]
              .filter(Boolean)
              .join(" · ") || "Contact non renseigné"}
          </p>
          {prospect.contactSourceUrl ? (
            <EvidenceLink url={prospect.contactSourceUrl} />
          ) : null}
          <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 font-sans text-sm leading-relaxed">
            {prospect.draft}
          </pre>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(prospect.draft)
                  .then(() => toast.success("Brouillon copié."))
                  .catch(() =>
                    toast.error("Copie impossible. Sélectionnez le texte."),
                  );
              }}
            >
              <Copy className="size-4" />
              Copier le brouillon
            </Button>
            <Button variant="ghost" onClick={onEdit}>
              Modifier la fiche
            </Button>
          </div>
        </section>
        <section className="space-y-3 border-t pt-4">
          <label className="grid gap-2 text-sm font-medium">
            Statut
            <select
              className="h-10 rounded-lg border bg-background px-3"
              value={status}
              onChange={(e) => {
                const selected = PROSPECT_STATUSES.find(
                  (value) => value === e.target.value,
                );
                if (selected) setStatus(selected);
              }}
            >
              {PROSPECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PROSPECT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Note
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contexte de la qualification, du contact ou du résultat."
            />
          </label>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || status === prospect.status}
          >
            Enregistrer le statut
          </Button>
        </section>
        <WorkbenchHistory
          projectId={prospect.projectId}
          prospectId={prospect.id}
        />
      </DialogContent>
    </Dialog>
  );
}
