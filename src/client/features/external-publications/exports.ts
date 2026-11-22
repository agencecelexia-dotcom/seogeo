import { buildCsv } from "@/client/lib/csv";
import {
  EXTERNAL_PUBLICATION_LINK_POLICY_LABELS,
  EXTERNAL_PUBLICATION_STATUS_LABELS,
  type ExternalPublication,
} from "@/types/schemas/external-publications";
import { methodById } from "./catalog";

export function publicationMarkdown(publication: ExternalPublication): string {
  return [
    `# ${publication.title}`,
    "",
    `Méthode : ${methodById(publication.strategyId).title}`,
    `Support : ${publication.platformName}`,
    `Sujet : ${publication.targetKeyword}`,
    `Statut : ${EXTERNAL_PUBLICATION_STATUS_LABELS[publication.status]}`,
    `Page cible : ${publication.targetUrl}`,
    `Site du support : ${publication.supportUrl || "À préciser"}`,
    `URL publiée : ${publication.publishedUrl || "Non renseignée"}`,
    `Qualification du lien : ${EXTERNAL_PUBLICATION_LINK_POLICY_LABELS[publication.linkPolicy]} (déclarée manuellement)`,
    "",
    "## Brief",
    "",
    publication.brief,
    "",
    "## Mesure",
    "",
    methodById(publication.strategyId).measurement,
    "Pour une observation GEO : conserver la date, le moteur, le prompt, le pays et l’URL citée. Distinguer mention de marque et citation ; aucune attribution causale automatique.",
    "",
    "Indexation et directives de la page externe : à vérifier manuellement.",
  ].join("\n");
}

export function publicationsCsv(publications: ExternalPublication[]): string {
  return buildCsv(
    [
      "Méthode",
      "Support",
      "Sujet",
      "Titre",
      "Page cible",
      "Site du support",
      "Statut",
      "URL publiée",
      "Qualification du lien (déclarée)",
      "Brief",
      "Publication déclarée le",
      "Modifiée le",
    ],
    publications.map((p) => [
      methodById(p.strategyId).title,
      p.platformName,
      p.targetKeyword,
      p.title,
      p.targetUrl,
      p.supportUrl,
      EXTERNAL_PUBLICATION_STATUS_LABELS[p.status],
      p.publishedUrl,
      EXTERNAL_PUBLICATION_LINK_POLICY_LABELS[p.linkPolicy],
      p.brief,
      p.publishedAt,
      p.updatedAt,
    ]),
  );
}
