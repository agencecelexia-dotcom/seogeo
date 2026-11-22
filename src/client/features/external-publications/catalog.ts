import type { ExternalPublicationStrategyId } from "@/types/schemas/external-publications";

export type ResearchContext = { keyword: string; sector: string; city: string };
type Method = {
  id: ExternalPublicationStrategyId;
  title: string;
  platform: string;
  description: string;
  steps: string[];
  checks: string;
  measurement: string;
  queries: string[];
  sources: { title: string; url: string }[];
};

export const PUBLICATION_METHODS: Method[] = [
  {
    id: "medium_republish",
    title: "Republier un guide sur Medium",
    platform: "Medium",
    description:
      "Donner une seconde audience à une ressource déjà publiée sur votre site.",
    steps: [
      "Publier d’abord un guide utile sur votre site.",
      "Importer l’article dans Medium, puis adapter l’introduction à ses lecteurs.",
      "Vérifier les images, les liens et le canonical vers l’original avant de partager.",
    ],
    checks:
      "L’import Medium ajoute un canonical vers l’original. Vérifier la page publiée ; Google peut choisir une autre URL canonique.",
    measurement: "Lectures, visites référentes et demandes reçues.",
    queries: ['site:medium.com "{sujet}" "{secteur}"'],
    sources: [
      {
        title: "Import Medium",
        url: "https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium",
      },
      {
        title: "Canonical : Google",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
    ],
  },
  {
    id: "linkedin_article",
    title: "Article ou newsletter LinkedIn",
    platform: "LinkedIn",
    description:
      "Transformer votre expérience métier en contenu autonome pour une audience professionnelle.",
    steps: [
      "Choisir un problème précis et un retour terrain que vous pouvez documenter.",
      "Rédiger : problème, méthode, exemple réel et limites ; ajouter un lien contextuel vers la ressource complète.",
      "Publier manuellement un article, ou une newsletter si une série régulière est prévue.",
    ],
    checks:
      "Les articles de Page proposent un titre et une description SEO. Vérifier le rendu et les options réellement disponibles sur votre compte.",
    measurement: "Lectures, abonnements et clics qualifiés.",
    queries: [
      'site:linkedin.com/pulse "{sujet}"',
      'site:linkedin.com/newsletters "{secteur}"',
    ],
    sources: [
      {
        title: "Articles LinkedIn",
        url: "https://www.linkedin.com/help/linkedin/answer/a563519",
      },
      {
        title: "Newsletters LinkedIn",
        url: "https://www.linkedin.com/help/linkedin/answer/a522525",
      },
    ],
  },
  {
    id: "guest_article",
    title: "Contribuer à un média métier",
    platform: "Média métier à sélectionner",
    description:
      "Proposer un angle original à une rédaction suivie par vos futurs clients.",
    steps: [
      "Identifier des médias lus par votre audience et lire leur charte de contribution.",
      "Préparer un angle inédit, avec vos données, exemples et sources réelles.",
      "Proposer le brouillon à la rédaction ; conserver un lien utile et naturel vers votre ressource.",
    ],
    checks:
      "Si le placement est rémunéré, demander un lien sponsored (nofollow est également accepté par Google). La décision éditoriale appartient au média.",
    measurement:
      "Acceptation, audience de l’article, visites référentes et prises de contact.",
    queries: [
      '"{secteur}" "proposer un article"',
      '"{sujet}" "tribune" "contribuer"',
    ],
    sources: [
      {
        title: "Qualification des liens",
        url: "https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links",
      },
    ],
  },
  {
    id: "local_partner",
    title: "Créer une ressource avec un partenaire local",
    platform: "Partenaire local à sélectionner",
    description:
      "Documenter un projet, un atelier ou une ressource utile avec un réseau de proximité.",
    steps: [
      "Identifier une association, un fournisseur ou un réseau professionnel pertinent.",
      "Préparer un guide local, un compte rendu d’atelier ou un cas client avec son autorisation.",
      "Vérifier les noms, les faits et les citations ; proposer un lien de marque utile aux lecteurs.",
    ],
    checks:
      "Choisir une coopération réelle et vérifier la cohérence des informations publiques.",
    measurement: "Demandes locales, consultations de la ressource et mentions.",
    queries: [
      '"{ville}" "{secteur}" "association"',
      '"{ville}" "club entreprises" "atelier"',
    ],
    sources: [
      {
        title: "Exemple de réseau : France Num",
        url: "https://www.francenum.gouv.fr/a-propos-de-france-num",
      },
    ],
  },
  {
    id: "community_answer",
    title: "Répondre dans une communauté",
    platform: "Communauté à sélectionner",
    description:
      "Répondre à une vraie question là où votre expertise est utile.",
    steps: [
      "Trouver une question précise et lire les règles de la communauté.",
      "Donner une réponse complète sur place, avec les limites et votre affiliation.",
      "Ajouter un lien seulement s’il apporte un complément utile et si les règles l’autorisent.",
    ],
    checks:
      "Les règles de promotion varient selon la communauté. Les liens peuvent être ugc ou nofollow ; vérifier leur traitement manuellement.",
    measurement: "Réponses jugées utiles et visites qualifiées.",
    queries: ['site:reddit.com "{sujet}"', '"forum" "{secteur}" "{sujet}"'],
    sources: [
      {
        title: "Contributions et affiliation",
        url: "https://stackoverflow.com/help/promotion",
      },
      {
        title: "Règles Reddit",
        url: "https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community",
      },
    ],
  },
  {
    id: "video_resource",
    title: "Publier une démonstration YouTube",
    platform: "YouTube",
    description:
      "Montrer la résolution d’un problème et relier la vidéo à une ressource approfondie.",
    steps: [
      "Filmer une démonstration concrète ou un cas réel, avec un résultat observable.",
      "Écrire un titre précis, une description et des chapitres ; publier un résumé sur votre site.",
      "Ajouter dans la description un lien vers une ressource utile et vérifier qu’il est cliquable.",
    ],
    checks:
      "Les liens des descriptions de vidéos longues requièrent les fonctionnalités avancées. Ceux des descriptions de Shorts ne sont pas cliquables.",
    measurement:
      "Recherches YouTube, rétention, visites référentes et conversions.",
    queries: ['site:youtube.com/watch "{sujet}" "tutoriel"'],
    sources: [
      {
        title: "Liens sur YouTube",
        url: "https://support.google.com/youtube/answer/13748639",
      },
      {
        title: "Fonctionnalités avancées",
        url: "https://support.google.com/youtube/answer/12948449",
      },
    ],
  },
  {
    id: "industry_directory",
    title: "Créer une fiche dans un annuaire métier",
    platform: "Annuaire métier à sélectionner",
    description:
      "Être présent dans un réseau professionnel qui impose une éligibilité réelle.",
    steps: [
      "Vérifier les critères d’admission et la pertinence du réseau pour vos clients.",
      "Renseigner des coordonnées exactes, votre activité et des références vérifiables.",
      "Contrôler la fiche publiée et la mettre à jour quand votre activité évolue.",
    ],
    checks:
      "France Num peut convenir à certains prestataires du numérique sous conditions. Le référencement dans ce réseau n’est pas une certification.",
    measurement: "Contacts directs et exactitude des informations de la fiche.",
    queries: [
      '"{secteur}" "annuaire" "adhérents" "{ville}"',
      'site:francenum.gouv.fr "activateurs" "{ville}"',
    ],
    sources: [
      {
        title: "Conditions France Num",
        url: "https://www.francenum.gouv.fr/experts-du-numerique/experts-du-numerique-rejoignez-le-reseau-des-activateurs-france-num",
      },
    ],
  },
];

export function methodById(id: ExternalPublicationStrategyId): Method {
  return PUBLICATION_METHODS.find((method) => method.id === id)!;
}

export function searchQuery(
  template: string,
  context: ResearchContext,
): string {
  const values = {
    sujet: context.keyword.trim() || "votre sujet",
    secteur: context.sector.trim() || "votre métier",
    ville: context.city.trim() || "votre ville",
  };
  return template.replace(
    /\{(sujet|secteur|ville)\}/g,
    (_, key: keyof typeof values) => values[key].replace(/["\r\n]/g, " "),
  );
}

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?${new URLSearchParams({ q: query })}`;
}

export function methodBrief(
  id: ExternalPublicationStrategyId,
  context: ResearchContext,
): string {
  const method = methodById(id);
  return [
    `Objectif : ${method.description}`,
    `Sujet : ${context.keyword.trim() || "À préciser"}`,
    `Audience : ${[context.sector.trim(), context.city.trim()].filter(Boolean).join(" · ") || "À préciser"}`,
    "",
    "Angle et preuve à apporter :",
    "[Ajouter votre exemple, vos données ou votre expérience réelle.]",
    "",
    "Étapes :",
    ...method.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `À vérifier : ${method.checks}`,
    `Mesurer : ${method.measurement}`,
    "",
    "Après publication : vérifier manuellement l’URL, le lien, ses attributs et les éventuelles directives noindex/canonical. L’indexation reste à vérifier.",
  ].join("\n");
}
