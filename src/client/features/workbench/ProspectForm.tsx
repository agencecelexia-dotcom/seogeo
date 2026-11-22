import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { saveProspect } from "@/serverFunctions/workbench";
import type { BacklinkProspect } from "@/server/features/workbench/WorkbenchRepository";
import { saveProspectSchema } from "@/types/schemas/workbench";

export function ProspectForm({
  projectId,
  prospect,
  onClose,
  onSaved,
}: {
  projectId: string;
  prospect?: BacklinkProspect;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof saveProspect>[0]) =>
      saveProspect(input),
    onSuccess: (result) => {
      toast.success(
        result.created
          ? "Prospect ajouté."
          : "Prospect enregistré ou déjà présent.",
      );
      onSaved();
    },
  });
  const form = useAppForm({
    defaultValues: {
      sourceUrl: prospect?.sourceUrl ?? "",
      targetUrl: prospect?.targetUrl ?? "",
      reason: prospect?.reason ?? "",
      contactName: prospect?.contactName ?? "",
      contactEmail: prospect?.contactEmail ?? "",
      contactSourceUrl: prospect?.contactSourceUrl ?? "",
      draft: prospect?.draft ?? "",
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
        const result = saveProspectSchema.safeParse({ ...value, projectId });
        if (result.success) return undefined;
        return {
          fields: Object.fromEntries(
            result.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        };
      },
    },
    onSubmit: ({ value }) =>
      mutation.mutateAsync({
        data: { projectId, prospectId: prospect?.id, ...value },
      }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form.AppForm>
          <form.Form className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {prospect ? "Modifier le prospect" : "Nouveau prospect"}
              </DialogTitle>
            </DialogHeader>
            <form.AppField name="sourceUrl">
              {(field) => (
                <field.TextField
                  label="Page source"
                  description="La page où une mention ou un lien serait pertinent."
                  placeholder="https://publication.fr/article"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="targetUrl">
              {(field) => (
                <field.TextField
                  label="Page de ton site à proposer"
                  placeholder="https://monsite.fr/ressource"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="reason">
              {(field) => (
                <field.TextareaField
                  label="Pourquoi cette opportunité est pertinente"
                  description="Contexte éditorial et preuve. Ce texte servira de base au brouillon."
                  required
                />
              )}
            </form.AppField>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="contactName">
                {(field) => <field.TextField label="Nom du contact" />}
              </form.AppField>
              <form.AppField name="contactEmail">
                {(field) => (
                  <field.TextField
                    label="Adresse e-mail publique"
                    type="email"
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="contactSourceUrl">
              {(field) => (
                <field.TextField
                  label="Source du contact"
                  description="Obligatoire si une adresse e-mail est renseignée."
                  placeholder="https://publication.fr/contact"
                />
              )}
            </form.AppField>
            <form.AppField name="draft">
              {(field) => (
                <field.TextareaField
                  label="Brouillon"
                  description="Laisser vide pour préparer une trame à personnaliser. Aucun message n’est envoyé."
                  className="min-h-44"
                />
              )}
            </form.AppField>
            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Annuler
              </Button>
              <form.SubmitButton>Enregistrer</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
