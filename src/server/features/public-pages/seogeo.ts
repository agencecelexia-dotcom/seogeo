import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const pages = {
  about: {
    title: "SEO GEO — Le suivi privé de vos sites",
    heading: "Vos sites, leurs résultats, vos prochaines actions.",
    introduction:
      "SEO GEO est une plateforme privée pour suivre le référencement naturel et la visibilité des sites dans les réponses des moteurs d’intelligence artificielle.",
    body: `<section class="grid" aria-label="Fonctionnalités">
      <article><span class="number">01</span><h2>Mesurer</h2><p>Rassembler les performances Google Search Console et Google Analytics des propriétés que vous choisissez de connecter.</p></article>
      <article><span class="number">02</span><h2>Comprendre</h2><p>Examiner les pages, les requêtes, le trafic et les audits pour repérer les sujets et les corrections utiles.</p></article>
      <article><span class="number">03</span><h2>Agir</h2><p>Organiser les recommandations, les recherches de liens et le suivi SEO/GEO dans les projets de vos sites.</p></article>
    </section>
    <section><h2>Une connexion Google en lecture seule</h2><p>La connexion est facultative. Après votre autorisation, vous choisissez la propriété Search Console et la propriété Analytics de chaque projet. SEO GEO consulte les statistiques et les informations de ces propriétés ; cette connexion ne permet pas de modifier leur configuration ni le contenu de vos sites.</p><p>Consultez la <a href="/privacy">politique de confidentialité</a> pour connaître les données utilisées, leur stockage et les moyens de retirer l’accès.</p></section>
    <section><h2>Un espace réservé aux utilisateurs autorisés</h2><p>Cette instance sert au suivi des sites de son administrateur et des personnes qu’il autorise. L’accès aux projets et à leurs données nécessite une connexion.</p><a class="button" href="/sign-in">Accéder à mon espace</a></section>`,
  },
  privacy: {
    title: "Confidentialité — SEO GEO",
    heading: "Vos données dans SEO GEO",
    introduction:
      "Cette page décrit le fonctionnement de l’instance privée SEO GEO hébergée sur seogeo-indol.vercel.app, notamment ses connexions facultatives à Google Search Console et Google Analytics.",
    body: `<section><h2>Responsable et contact</h2><p>L’instance est administrée par Celexia. Pour toute question sur les données, un accès ou une demande de suppression : <a href="mailto:agence.celexia@gmail.com">agence.celexia@gmail.com</a>.</p></section>
    <section><h2>Données consultées avec votre autorisation</h2><ul>
      <li><strong>Compte Google :</strong> identifiant du compte, adresse e-mail et informations de profil nécessaires à l’identification de la connexion.</li>
      <li><strong>Search Console :</strong> liste des propriétés accessibles, clics, impressions, taux de clics, positions, requêtes, pages et informations d’indexation des URL demandées.</li>
      <li><strong>Google Analytics :</strong> liste des propriétés accessibles et rapports de mesure, notamment trafic, sources d’acquisition, pages, événements et conversions. Les rapports peuvent aussi contenir des dimensions telles que le pays ou l’appareil, selon la requête effectuée.</li>
    </ul><p>Les autorisations de données demandées sont <code>webmasters.readonly</code> et <code>analytics.readonly</code>. Elles servent à lire vos données. SEO GEO ne demande pas d’accès à Gmail, à Google Drive ni de permission d’écriture sur Search Console ou Analytics.</p></section>
    <section><h2>Utilisation des données</h2><p>Les données servent à afficher les performances des propriétés sélectionnées, établir des rapports et identifier des actions d’amélioration SEO. Les lectures peuvent être déclenchées dans l’interface, par les automatisations configurées ou par les outils MCP que vous autorisez.</p><p>Connecter Google ne publie pas les statistiques sur les pages publiques de présentation de SEO GEO.</p></section>
    <section><h2>Stockage et accès</h2><p>L’application fonctionne sur Vercel. Les comptes, les paramètres des projets et les autorisations Google sont stockés dans la base PostgreSQL Neon de cette instance. Les jetons d’accès et de renouvellement Google sont chiffrés avant leur enregistrement en base. Des résultats mis en cache, fichiers ou rapports peuvent être conservés dans le stockage privé de l’instance, notamment Vercel Blob.</p><p>Les utilisateurs autorisés de votre organisation peuvent consulter les données des projets auxquels ils ont accès. Les prestataires d’hébergement traitent les données nécessaires au fonctionnement de l’instance. Les pages publiques de présentation, de confidentialité et d’utilisation ne chargent aucun script ni traceur tiers.</p></section>
    <section><h2>Exports, rapports et assistants externes</h2><p>Si vous exportez un rapport, créez un lien de partage ou connectez un assistant externe par MCP, les données contenues dans ces résultats peuvent être communiquées aux destinataires ou au service que vous avez choisi. Un assistant peut ainsi recevoir des statistiques Google lorsqu’il appelle les outils correspondants. Consultez les règles de ce service avant de lui donner accès à vos données.</p><p>Les intégrations Google sont distinctes des fournisseurs d’intelligence artificielle éventuellement configurés dans l’instance.</p></section>
    <section><h2>Conservation, déconnexion et suppression</h2><p>Les autorisations sont conservées pour renouveler la connexion et lire les propriétés liées à vos projets. Des résultats peuvent rester dans les caches, rapports enregistrés ou exports déjà créés.</p><p>Dans les intégrations d’un projet, <strong>Disconnect project</strong> retire le lien avec sa propriété. Pour supprimer une autorisation enregistrée, utilisez <strong>Manage Google accounts</strong> puis la suppression du compte concerné. Vous pouvez également retirer l’accès de SEO GEO depuis les <a href="https://myaccount.google.com/connections">connexions de votre compte Google</a>.</p><p>La déconnexion d’une propriété ne supprime pas automatiquement les rapports et fichiers déjà enregistrés ou transmis. Pour demander leur suppression dans cette instance, contactez l’administrateur en précisant le projet concerné. Les copies que vous avez exportées ou partagées restent à gérer auprès de leurs destinataires.</p></section>
    <section><h2>Session et mises à jour</h2><p>L’espace privé utilise les cookies nécessaires à l’authentification. Cette page est mise à jour lorsque le fonctionnement décrit évolue.</p></section>`,
  },
  terms: {
    title: "Utilisation — SEO GEO",
    heading: "Utiliser l’espace privé SEO GEO",
    introduction:
      "Ces règles décrivent l’usage de cette instance privée de suivi SEO/GEO et de ses connexions aux services externes.",
    body: `<section><h2>Accès autorisé</h2><p>L’espace est réservé à l’administrateur et aux utilisateurs qu’il autorise. Utilisez uniquement les sites et les comptes pour lesquels vous disposez des droits nécessaires. Gardez vos identifiants privés et signalez tout accès inattendu à <a href="mailto:agence.celexia@gmail.com">agence.celexia@gmail.com</a>.</p></section>
    <section><h2>Connexions et services externes</h2><p>Les connexions Google Search Console et Analytics sont facultatives et en lecture seule. Vous choisissez les propriétés associées à vos projets et pouvez retirer ces connexions. Les services externes restent soumis à leurs propres conditions, quotas et disponibilités.</p><p>D’autres fonctions peuvent nécessiter un fournisseur ou des crédits supplémentaires. Leur configuration est distincte de la connexion Google ; un accès à SEO GEO ne fournit pas automatiquement des crédits chez ces prestataires.</p></section>
    <section><h2>Interpréter les résultats</h2><p>Les rapports, audits et recommandations servent à préparer vos décisions. Les statistiques dépendent des données et délais des fournisseurs ; les contenus proposés par une intelligence artificielle peuvent contenir des erreurs. Vérifiez les résultats avant une modification de site, une publication ou une prise de contact.</p><p>L’application ne garantit ni position dans les moteurs de recherche, ni citation dans une réponse d’IA, ni volume de trafic.</p></section>
    <section><h2>Confidentialité et partage</h2><p>Consultez la <a href="/privacy">politique de confidentialité</a> avant de connecter un compte Google, partager un rapport ou autoriser un assistant externe. Ne partagez que des données et contenus que vous êtes autorisé à communiquer.</p></section>
    <section><h2>Assistance</h2><p>Pour une question sur l’accès, une connexion ou la suppression de données, contactez <a href="mailto:agence.celexia@gmail.com">agence.celexia@gmail.com</a>.</p></section>`,
  },
} as const;

// Raw documents are intentionally public and do not depend on an app session,
// React hydration or a provider API. The Vercel instance owns this branding;
// upstream hosted and other self-hosted editions keep their existing pages.
export async function seogeoPublicPage(page: keyof typeof pages) {
  if ((await getOptionalEnvValue("RUNTIME_PLATFORM")) !== "vercel") {
    return new Response("Not found", { status: 404 });
  }
  const content = pages[page];
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Présentation et informations de l’instance privée SEO GEO."><title>${content.title}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f8;color:#18252a;font:16px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#096954;text-underline-offset:4px}a:hover{color:#044b3c}a:focus-visible{outline:3px solid #178b75;outline-offset:5px}header,main,footer{width:min(100% - 40px,960px);margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 0;border-bottom:1px solid #dce4e5}.brand{font-weight:800;letter-spacing:.1em;text-decoration:none}nav{display:flex;gap:20px;flex-wrap:wrap;font-size:14px}.hero{padding:58px 0 32px}.eyebrow{color:#53656a;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(30px,5vw,48px);line-height:1.14;letter-spacing:-.04em;max-width:780px;margin:18px 0 22px}h2{font-size:21px;line-height:1.35;letter-spacing:-.02em;margin:0 0 12px}.lead{font-size:19px;color:#4c6268;max-width:800px}section{background:white;border:1px solid #dce4e5;border-radius:16px;margin:20px 0;padding:28px}section p{margin:12px 0 0}ul{margin:12px 0 0;padding-left:23px}li+li{margin-top:12px}code{font-size:14px;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.grid p{font-size:15px;color:#4c6268}.number{display:block;color:#17816a;font-size:13px;font-weight:750;letter-spacing:.1em;margin-bottom:15px}.button{display:inline-block;background:#096954;color:white;border-radius:9px;padding:11px 18px;text-decoration:none;font-weight:650;margin-top:22px}.button:hover{background:#044b3c;color:white}footer{padding:28px 0 38px;color:#5b6d72;font-size:13px}footer p{margin-top:18px}@media(max-width:650px){header{align-items:flex-start;flex-direction:column;gap:14px}.hero{padding-top:34px}section{padding:22px}.grid{grid-template-columns:1fr;gap:25px}.grid article+article{border-top:1px solid #e5ebec;padding-top:22px}nav{gap:12px 18px}.lead{font-size:17px}}
</style></head><body><header><a class="brand" href="/about" aria-label="SEO GEO — présentation">SEO GEO</a><nav aria-label="Navigation principale"><a href="/about">Présentation</a><a href="/privacy">Confidentialité</a><a href="/terms">Utilisation</a><a href="/sign-in">Connexion</a></nav></header><main><div class="hero"><p class="eyebrow">Plateforme privée · SEO et GEO</p><h1>${content.heading}</h1><p class="lead">${content.introduction}</p></div>${content.body}</main><footer><nav aria-label="Informations"><a href="/about">À propos de SEO GEO</a><a href="/privacy">Politique de confidentialité</a><a href="/terms">Conditions d’utilisation</a><a href="mailto:agence.celexia@gmail.com">Contact</a></nav><p>Mise à jour : 23 novembre 2026.</p></footer></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Language": "fr",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    },
  );
}
