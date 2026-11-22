import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";

import { Textarea } from "@/client/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

import { updateActionStatus, verifyAction } from "@/serverFunctions/workbench";
import type { WorkbenchAction } from "@/server/features/workbench/WorkbenchRepository";
import {
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  type ActionStatus,
} from "@/types/schemas/workbench";

import { EvidenceLink, WorkbenchHistory } from "./shared";

export function ActionDetails({
  action,
  onClose,
  onChanged,
}: {
  action: WorkbenchAction;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      updateActionStatus({
        data: {
          projectId: action.projectId,
          actionId: action.id,
          status,
          note,
        },
      }),
    onSuccess: async () => {
      setNote("");
      toast.success("Action mise à jour.");
      await onChanged();
    },
  });
  const verification = useMutation({
    mutationFn: () =>
      verifyAction({
        data: { projectId: action.projectId, actionId: action.id },
      }),
    onSuccess: async (result) => {
      if (result.verified) {
        toast.success(result.reason);
        setStatus("verified");
      } else toast.info(result.reason);
      await onChanged();
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
          <DialogTitle>{action.title}</DialogTitle>
        </DialogHeader>
        <EvidenceLink url={action.pageUrl} />
        <section className="space-y-2">
          <h3 className="font-medium">Constat</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {action.evidenceText}
          </p>
          {action.evidenceUrl ? (
            <EvidenceLink url={action.evidenceUrl} />
          ) : null}
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">Correction proposée</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {action.recommendation}
          </p>
        </section>
        <section className="space-y-3 rounded-lg border p-4">
          <label className="grid gap-2 text-sm font-medium">
            Statut
            <select
              className="h-10 rounded-lg border bg-background px-3"
              value={status}
              onChange={(e) => {
                const selected = ACTION_STATUSES.find(
                  (value) => value === e.target.value,
                );
                if (selected) setStatus(selected);
              }}
            >
              {ACTION_STATUSES.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={
                    value === "verified" &&
                    action.status !== "done" &&
                    action.status !== "verified"
                  }
                >
                  {ACTION_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Note et preuve de vérification
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ce qui a été changé ou contrôlé, avec la date et la source."
            />
          </label>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              status === action.status ||
              (status === "verified" && note.trim().length < 10)
            }
          >
            Enregistrer le statut
          </Button>
          {action.status === "done" && action.source === "audit" ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                Un nouvel audit doit avoir analysé cette page après la
                correction. Une absence de données ne valide pas l’action.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => verification.mutate()}
                  disabled={verification.isPending}
                >
                  Vérifier sur le dernier audit
                </Button>
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={
                    <Link
                      to="/p/$projectId/audit"
                      params={{ projectId: action.projectId }}
                    />
                  }
                >
                  Ouvrir les audits
                </Button>
              </div>
            </div>
          ) : null}
        </section>
        <WorkbenchHistory projectId={action.projectId} actionId={action.id} />
      </DialogContent>
    </Dialog>
  );
}
