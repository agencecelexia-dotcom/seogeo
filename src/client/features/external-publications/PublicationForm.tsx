import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { saveExternalPublication } from "@/serverFunctions/externalPublications";
import {
  EXTERNAL_PUBLICATION_STATUSES,
  EXTERNAL_PUBLICATION_STATUS_LABELS,
  EXTERNAL_PUBLICATION_LINK_POLICIES,
  EXTERNAL_PUBLICATION_LINK_POLICY_LABELS,
  saveExternalPublicationSchema,
  type ExternalPublication,
  type ExternalPublicationStrategyId,
  type ExternalPublicationStatus,
  type ExternalPublicationLinkPolicy,
} from "@/types/schemas/external-publications";
import {
  methodBrief,
  methodById,
  PUBLICATION_METHODS,
  type ResearchContext,
} from "./catalog";

export function PublicationForm({
  projectId,
  publication,
  strategyId,
  context,
  targetUrl,
  onClose,
  onSaved,
}: {
  projectId: string;
  publication?: ExternalPublication;
  strategyId: ExternalPublicationStrategyId;
  context: ResearchContext;
  targetUrl: string;
  onClose: () => void;
  onSaved: (publication: ExternalPublication) => void;
}) {
  const method = methodById(strategyId);
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof saveExternalPublication>[0]) =>
      saveExternalPublication(input),
    onSuccess: (saved) => {
      toast.success("Fiche enregistrée.");
      onSaved(saved);
    },
  });
  const identity = {
    projectId,
    id: publication?.id,
    revision: publication?.revision,
  };
  const form = useAppForm({
    defaultValues: {
      strategyId: publication?.strategyId ?? strategyId,
      platformName: publication?.platformName ?? method.platform,
      targetKeyword: publication?.targetKeyword ?? context.keyword,
      targetUrl: publication?.targetUrl ?? targetUrl,
      supportUrl: publication?.supportUrl ?? "",
      title:
        publication?.title ??
        `${context.keyword.trim() || "Sujet à préciser"} — ${method.title}`,
      brief: publication?.brief ?? methodBrief(strategyId, context),
      status: publication?.status ?? ("idea" as ExternalPublicationStatus),
      publishedUrl: publication?.publishedUrl ?? "",
      linkPolicy:
        publication?.linkPolicy ?? ("unknown" as ExternalPublicationLinkPolicy),
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
        const parsed = saveExternalPublicationSchema.safeParse({
          ...value,
          ...identity,
        });
        if (parsed.success) return undefined;
        return {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.code === "too_small"
                ? "Renseignez ce champ."
                : issue.code === "too_big"
                  ? "Ce champ est trop long."
                  : issue.code === "invalid_format"
                    ? "Indiquez une URL HTTP(S) valide."
                    : issue.message,
            ]),
          ),
        };
      },
    },
    onSubmit: ({ value }) =>
      mutation.mutateAsync({ data: { ...value, ...identity } }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <form.AppForm>
          <form.Form className="space-y-5">
            <DialogHeader>
              <DialogTitle>
                {publication
                  ? "Modifier la publication"
                  : "Nouvelle publication externe"}
              </DialogTitle>
              <DialogDescription>
                Préparez votre contenu et suivez sa publication sur le support
                choisi.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="strategyId">
                {(field) => (
                  <field.SelectField
                    label="Méthode"
                    items={PUBLICATION_METHODS.map((m) => ({
                      value: m.id,
                      label: m.title,
                    }))}
                  />
                )}
              </form.AppField>
              <form.AppField name="platformName">
                {(field) => (
                  <field.TextField
                    label="Nom du support"
                    required
                    maxLength={200}
                  />
                )}
              </form.AppField>
              <form.AppField name="targetKeyword">
                {(field) => (
                  <field.TextField
                    label="Mot-clé ou sujet ciblé"
                    required
                    maxLength={300}
                  />
                )}
              </form.AppField>
              <form.AppField name="supportUrl">
                {(field) => (
                  <field.TextField
                    label="Site ou profil du support"
                    type="url"
                    placeholder="https://media.fr"
                    maxLength={2048}
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="targetUrl">
              {(field) => (
                <field.TextField
                  label="Page de votre site à mettre en avant"
                  type="url"
                  placeholder="https://votre-site.fr/guide"
                  required
                  maxLength={2048}
                />
              )}
            </form.AppField>
            <form.AppField name="title">
              {(field) => (
                <field.TextField
                  label="Titre de la publication"
                  required
                  maxLength={300}
                />
              )}
            </form.AppField>
            <form.AppField name="brief">
              {(field) => (
                <field.TextareaField
                  label="Brief et brouillon"
                  className="min-h-52"
                  maxLength={20000}
                  description="Personnalisez l’angle, les preuves et le contenu pour les lecteurs de ce support."
                />
              )}
            </form.AppField>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="status">
                {(field) => (
                  <field.SelectField
                    label="Statut"
                    items={EXTERNAL_PUBLICATION_STATUSES.map((value) => ({
                      value,
                      label: EXTERNAL_PUBLICATION_STATUS_LABELS[value],
                    }))}
                  />
                )}
              </form.AppField>
              <form.AppField name="linkPolicy">
                {(field) => (
                  <field.SelectField
                    label="Qualification du lien"
                    description="Indication manuelle. À confirmer sur la page publiée, y compris un éventuel attribut ugc."
                    items={EXTERNAL_PUBLICATION_LINK_POLICIES.map((value) => ({
                      value,
                      label: EXTERNAL_PUBLICATION_LINK_POLICY_LABELS[value],
                    }))}
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="publishedUrl">
              {(field) => (
                <field.TextField
                  label="URL de la publication"
                  type="url"
                  maxLength={2048}
                  placeholder="https://media.fr/votre-article"
                  description="Requise pour le statut Publiée. Ce statut décrit votre déclaration ; l’indexation reste à vérifier."
                />
              )}
            </form.AppField>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {getErrorCode(mutation.error) === "CONFLICT"
                  ? "Cette fiche a changé ou n’est plus accessible. Votre saisie est conservée ; fermez puis rouvrez la fiche pour charger sa dernière version."
                  : getStandardErrorMessage(
                      mutation.error,
                      "Impossible d’enregistrer la fiche.",
                    )}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Annuler
              </Button>
              <form.SubmitButton>Enregistrer la publication</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
