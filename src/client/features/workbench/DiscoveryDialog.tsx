import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";

import { Input } from "@/client/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

import { discoverProspects } from "@/serverFunctions/workbench";

export function DiscoveryDialog({
  projectId,
  onClose,
  onChanged,
}: {
  projectId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [targetUrl, setTargetUrl] = useState("");
  const mutation = useMutation({
    mutationFn: () => discoverProspects({ data: { projectId, targetUrl } }),
    onSuccess: async (result) => {
      toast.success(
        result.competitors
          ? `${result.added} prospect(s) ajouté(s) sur ${result.observed} liens examinés.`
          : "Ajoute d’abord des concurrents au contexte du site.",
      );
      await onChanged();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Découvrir des prospects</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Analyse jusqu’à 100 liens pour chacun des trois premiers concurrents
          du projet. Cette collecte utilise ton crédit DataForSEO. Les pages
          trouvées sont des pistes à qualifier, sans garantie qu’elles ne citent
          pas déjà ton site.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            Page de ton site à proposer
            <Input
              type="url"
              required
              placeholder="https://monsite.fr/ressource"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Recherche en cours…"
                : "Lancer la recherche"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/settings/context"
                  params={{ projectId }}
                />
              }
            >
              Configurer les concurrents
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
