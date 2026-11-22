import { z } from "zod";

export const ACTION_STATUSES = [
  "todo",
  "planned",
  "done",
  "verified",
  "dismissed",
] as const;
export const ACTION_PRIORITIES = ["high", "medium", "low"] as const;
export const PROSPECT_STATUSES = [
  "discovered",
  "qualified",
  "to_contact",
  "contacted",
  "acquired",
  "declined",
  "lost",
] as const;
export const LINK_CHECK_STATUSES = [
  "unchecked",
  "present",
  "missing",
  "error",
] as const;

export const ACTION_STATUS_LABELS: Record<
  (typeof ACTION_STATUSES)[number],
  string
> = {
  todo: "À faire",
  planned: "Planifiée",
  done: "Réalisée",
  verified: "Vérifiée",
  dismissed: "Écartée",
};
export const PROSPECT_STATUS_LABELS: Record<
  (typeof PROSPECT_STATUSES)[number],
  string
> = {
  discovered: "Détecté",
  qualified: "Qualifié",
  to_contact: "À contacter",
  contacted: "Contacté",
  acquired: "Acquis",
  declined: "Refusé",
  lost: "Perdu",
};
export const PRIORITY_LABELS = {
  high: "Haute",
  medium: "Moyenne",
  low: "Basse",
} as const;

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      // Zod also runs refinements on invalid URLs. Optional form inputs try
      // this union branch before the empty-string branch; never throw here.
      return false;
    }
  }, "Une URL HTTP(S) sans identifiants est requise.");
const optionalUrl = z
  .union([httpUrl, z.literal("")])
  .transform((value) => value || null)
  .nullable()
  .optional();
export const workbenchProjectSchema = z.object({
  projectId: z.string().min(1),
});
export const createActionSchema = workbenchProjectSchema.extend({
  title: z.string().trim().min(1).max(200),
  pageUrl: httpUrl,
  evidenceUrl: optionalUrl,
  evidenceText: z.string().trim().min(1).max(4000),
  recommendation: z.string().trim().min(1).max(6000),
  priority: z.enum(ACTION_PRIORITIES).default("medium"),
});
export const actionRefSchema = workbenchProjectSchema.extend({
  actionId: z.string().min(1),
});
export const updateActionStatusSchema = actionRefSchema
  .extend({
    status: z.enum(ACTION_STATUSES),
    note: z.string().trim().max(4000).default(""),
  })
  .refine((value) => value.status !== "verified" || value.note.length >= 10, {
    message: "Décrivez la preuve de vérification (10 caractères minimum).",
    path: ["note"],
  });
export const saveProspectSchema = workbenchProjectSchema
  .extend({
    prospectId: z.string().min(1).optional(),
    sourceUrl: httpUrl,
    targetUrl: httpUrl,
    reason: z.string().trim().min(1).max(4000),
    contactName: z.string().trim().max(200).default(""),
    contactEmail: z.union([z.email(), z.literal("")]).default(""),
    contactSourceUrl: optionalUrl,
    draft: z.string().trim().max(10000).default(""),
  })
  .refine((value) => !value.contactEmail || !!value.contactSourceUrl, {
    message: "Indiquez la page publique où ce contact a été trouvé.",
    path: ["contactSourceUrl"],
  });
export const prospectRefSchema = workbenchProjectSchema.extend({
  prospectId: z.string().min(1),
});
export const discoverProspectsSchema = workbenchProjectSchema.extend({
  targetUrl: httpUrl,
});
export const updateProspectStatusSchema = prospectRefSchema.extend({
  status: z.enum(PROSPECT_STATUSES),
  note: z.string().trim().max(4000).default(""),
});
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type ActionPriority = (typeof ACTION_PRIORITIES)[number];
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export type LinkCheckStatus = (typeof LINK_CHECK_STATUSES)[number];
export type CreateActionInput = z.infer<typeof createActionSchema>;
export type SaveProspectInput = z.infer<typeof saveProspectSchema>;

export const discoverySettingsSchema = workbenchProjectSchema.extend({
  enabled: z.boolean(),
  targetUrl: httpUrl,
});
