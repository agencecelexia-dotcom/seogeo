import { z } from "zod";

export const EXTERNAL_PUBLICATION_STRATEGIES = [
  "medium_republish",
  "linkedin_article",
  "guest_article",
  "local_partner",
  "community_answer",
  "video_resource",
  "industry_directory",
] as const;
export const EXTERNAL_PUBLICATION_STATUSES = [
  "idea",
  "drafting",
  "ready",
  "published",
  "archived",
] as const;
export const EXTERNAL_PUBLICATION_LINK_POLICIES = [
  "unknown",
  "editorial",
  "nofollow",
  "sponsored",
  "ugc",
] as const;
export type ExternalPublicationStrategyId =
  (typeof EXTERNAL_PUBLICATION_STRATEGIES)[number];
export type ExternalPublicationStatus =
  (typeof EXTERNAL_PUBLICATION_STATUSES)[number];
export type ExternalPublicationLinkPolicy =
  (typeof EXTERNAL_PUBLICATION_LINK_POLICIES)[number];
export const EXTERNAL_PUBLICATION_STATUS_LABELS: Record<
  ExternalPublicationStatus,
  string
> = {
  idea: "Idée",
  drafting: "En rédaction",
  ready: "Prête",
  published: "Publiée",
  archived: "Archivée",
};
export const EXTERNAL_PUBLICATION_LINK_POLICY_LABELS: Record<
  ExternalPublicationLinkPolicy,
  string
> = {
  unknown: "À vérifier",
  editorial: "Éditorial",
  nofollow: "Nofollow",
  sponsored: "Sponsorisé",
  ugc: "Contenu utilisateur (UGC)",
};
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
      return false;
    }
  }, "Indiquez une URL HTTP(S) sans identifiants.");
const optionalUrl = z
  .union([httpUrl, z.literal("")])
  .nullish()
  .transform((value) => value || null);
const contentSchema = z.object({
  strategyId: z.enum(EXTERNAL_PUBLICATION_STRATEGIES),
  platformName: z.string().trim().min(1).max(200),
  targetKeyword: z.string().trim().min(1).max(300),
  targetUrl: httpUrl,
  supportUrl: optionalUrl,
  title: z.string().trim().min(1).max(300),
  brief: z.string().trim().max(20_000).default(""),
  status: z.enum(EXTERNAL_PUBLICATION_STATUSES).default("idea"),
  publishedUrl: optionalUrl,
  linkPolicy: z.enum(EXTERNAL_PUBLICATION_LINK_POLICIES).default("unknown"),
});
export const externalPublicationsProjectSchema = z.object({
  projectId: z.string().min(1).max(128),
});
export const saveExternalPublicationSchema = contentSchema
  .extend({
    projectId: z.string().min(1).max(128),
    id: z.string().min(1).max(128).optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .superRefine((data, context) => {
    if (data.status === "published" && !data.publishedUrl) {
      context.addIssue({
        code: "custom",
        path: ["publishedUrl"],
        message:
          "Indiquez l’URL publiée avant de marquer cette publication comme publiée.",
      });
    }
    if (Boolean(data.id) !== (data.revision !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message:
          "Une modification requiert l’identifiant et la version de la publication.",
      });
    }
  });
export type SaveExternalPublicationInput = z.input<
  typeof saveExternalPublicationSchema
>;
export type ExternalPublication = z.output<typeof contentSchema> & {
  id: string;
  projectId: string;
  revision: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
