import { useMutation } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
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
import { createAction } from "@/serverFunctions/workbench";
import {
  createActionSchema,
  type ActionPriority,
} from "@/types/schemas/workbench";

export function ActionForm({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createAction>[0]) =>
      createAction(input),
    onSuccess: () => {
      toast.success("Action enregistrée.");
      onSaved();
    },
  });
  const form = useAppForm({
    defaultValues: {
      title: "",
      pageUrl: "",
      evidenceUrl: "",
      evidenceText: "",
      recommendation: "",
      priority: "medium" as ActionPriority,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
        const result = createActionSchema.safeParse({ ...value, projectId });
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
      mutation.mutateAsync({ data: { projectId, ...value } }),
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
              <DialogTitle>Nouvelle action</DialogTitle>
            </DialogHeader>
            <form.AppField name="title">
              {(field) => (
                <field.TextField
                  label="Action à entreprendre"
                  placeholder="Corriger le lien vers la page couverture"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="pageUrl">
              {(field) => (
                <field.TextField
                  label="Page concernée"
                  placeholder="https://monsite.fr/page"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="evidenceUrl">
              {(field) => (
                <field.TextField
                  label="URL de la preuve"
                  placeholder="https://..."
                />
              )}
            </form.AppField>
            <form.AppField name="evidenceText">
              {(field) => (
                <field.TextareaField
                  label="Constat et preuve"
                  description="Indiquez la source, la période et ce qui a été observé."
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="recommendation">
              {(field) => (
                <field.TextareaField label="Correction proposée" required />
              )}
            </form.AppField>
            <form.Field name="priority">
              {(field) => (
                <label className="grid gap-2 text-sm font-medium">
                  Priorité
                  <select
                    className="h-10 rounded-lg border bg-background px-3 text-sm"
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(
                        createActionSchema.shape.priority.parse(
                          event.target.value,
                        ),
                      )
                    }
                  >
                    <option value="high">Haute</option>
                    <option value="medium">Moyenne</option>
                    <option value="low">Basse</option>
                  </select>
                </label>
              )}
            </form.Field>
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
