# Plateforme SEO / GEO privée

Cette version adapte OpenSEO (MIT), révision `af3f995fe3ebbe21298df152465a5436842354ee`, pour un usage personnel multisite. Elle conserve React, TanStack Start, TypeScript, Drizzle, les schémas SQLite/PostgreSQL, le crawler HTML, le suivi de positions, les suivis IA et le serveur MCP de l’amont.

## Utilisation

La **Vue d’ensemble** propose d’ajouter Agence Celexia, Rénovation Metbach et ArtisansFrance, avec France et français comme marché par défaut. Cette étape ne lance aucun appel payant. Le menu **Projects** permet d’ajouter d’autres sites.

| Écran                         | Fonctionnement                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revue des sept derniers jours | Bilan privé des opérations, couverture, erreurs et priorités, recalculé à partir des preuves persistées ; téléchargement Markdown/CSV.                                                                                                       |
| Vue d’ensemble                | Connexions, dernier audit, relevés GEO et actions prioritaires sur tous les sites actifs.                                                                                                                                                    |
| Dossiers des pages            | Audit, clics/impressions GSC, sessions/événements clés GA4 organiques, preuves GEO importées, liens et actions réunis par URL exacte. Une URL absente de l’audit peut apparaître grâce aux autres sources.                                   |
| Actions prioritaires          | Création manuelle ou import des constats du dernier audit, priorité, preuve, correction et historique des statuts. Une correction issue d’un audit nécessite une nouvelle observation pour être vérifiée.                                    |
| Prospection de liens          | Qualification, source du contact, brouillon, historique, export CSV et contrôle du lien. Recherche explicite sur au plus trois concurrents configurés, jusqu’à 100 liens chacun ; programmation mensuelle facultative. Aucun envoi d’e-mail. |
| Imports SEO / GEO             | Prévisualisation CSV, validation des URL et des périodes, dédoublonnage, import atomique et conservation de la provenance. Google génératif, Bing AI et backlinks sont séparés. Voir [formats](IMPORTS.md).                                  |
| Collecte et budget            | Synchronisations Google, journal des erreurs et limites de couverture, audits HTML hebdomadaires facultatifs, réservations et coûts des appels payants.                                                                                      |
| Performance d’une page        | PageSpeed/Lighthouse mobile ou ordinateur et CrUX au niveau de la page, en lecture à la demande. Pas de substitution silencieuse par les données du domaine. Voir [configuration](PERFORMANCE.md).                                           |

Les écrans de recherche de mots-clés, suivi de positions, visibilité IA, SEO local, rapports et contexte restent disponibles. Le SEO local s’active pour un site éligible avec des établissements réels. Les relevés de moteurs IA via API et les rapports importés ne représentent pas une mesure universelle de toutes les interfaces grand public.

## Développement et déploiement

La cible de cette version est **Vercel pour le frontend et le backend**, avec PostgreSQL connecté depuis le Marketplace et un store Vercel Blob privé. Le [guide Vercel](VERCEL.md) décrit les variables, les migrations, la création du premier administrateur et le développement local. Les crons sont quotidiens pour rester compatibles avec Hobby ; les audits et suivis reprennent leurs étapes depuis PostgreSQL via Vercel Queues, même lorsque le navigateur est fermé.

Le chat intégré SAM dépend encore du moteur d’acteurs Cloudflare et est désactivé sur cette cible. Les recherches, audits, actions et la connexion d’un agent externe par MCP restent accessibles. Les rapports partagés et les embeds restent fermés en mode privé ; la télémétrie est désactivée et aucun service d’envoi de messages n’est configuré.

Les fichiers Docker et Cloudflare sont conservés comme variantes amont. Ils ne sont pas utilisés par le déploiement Vercel et possèdent leur propre base.

## Sources à connecter

| Configuration serveur                      | Usage                                                                                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth Google pour GSC et GA4. Activer les API Google correspondantes et enregistrer les callbacks `/api/gsc/oauth/callback` et `/api/ga4/oauth/callback` sur l’origine de l’application. Puis choisir la propriété dans les intégrations de chaque site. |
| `DATAFORSEO_API_KEY`                       | Identifiant API et mot de passe encodés en base64, utilisés pour les recherches SEO/GEO payantes. Ce n’est pas une clé Google.                                                                                                                           |
| `OPENROUTER_API_KEY`                       | Génération IA avec tarif et limites de texte contrôlés.                                                                                                                                                                                                  |
| `GOOGLE_PAGESPEED_API_KEY`                 | Facultative pour PageSpeed Insights ; un quota reste applicable.                                                                                                                                                                                         |
| `GOOGLE_CRUX_API_KEY`                      | Requise pour CrUX. Son absence est affichée comme une source non configurée.                                                                                                                                                                             |

Le [guide Google](SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md) détaille l’OAuth. Ne jamais coller de secrets dans le dépôt ou dans les fichiers CSV. Après modification des variables dans Vercel, effectuer un nouveau déploiement.

Les imports servent aux rapports Google génératifs et Bing AI : cette V1 ne simule pas une connexion API à ces rapports. Les connecteurs Google autorisent seulement l’accès aux propriétés explicitement choisies. Déconnecter une source supprime ses données de monitoring ; les imports manuels restent séparés.

## Collecte et interprétation

Chaque étape reprend un jour de données par source. Sur Vercel, le cron quotidien démarre jusqu’à 14 étapes par site, en arrière-plan : priorité au rafraîchissement des sept derniers jours disponibles, puis remontée progressive jusqu’à 480 jours, selon la rétention et les quotas des sources. Les synchronisations manuelles permettent aussi d’avancer cette couverture. Les données GSC finales ont trois jours de décalage ; GA4 commence à J−1. GSC conserve son fuseau de reporting, GA4 celui de la propriété. Les horodatages de l’interface sont affichés en Europe/Paris.

Le relevé quotidien est plafonné à 1 000 pages par source. Le journal indique les limites de Google, les lignes tronquées, les erreurs, les sources non connectées et les réponses vides. GSC peut ne fournir que ses principales lignes même sous le plafond. Les totaux du site ne sont jamais additionnés aux totaux des pages. Les URL GA4 sont reconstruites à partir de l’hôte et du chemin de la page d’entrée avec HTTPS ; les URL non identifiables restent hors des dossiers de pages. Les rapprochements conservent les différences d’hôte, de paramètres et de slash final.

Le dossier d’une page réunit les données Google collectées sur les 28 derniers jours et indique les jours observés par source. Les périodes des imports restent explicites et ne sont pas additionnées entre elles. Les lectures sont bornées : 1 000 pages d’audit, 30 000 lignes quotidiennes, 2 000 observations GEO, 2 000 backlinks et 1 000 actions ; une limite atteinte est signalée. L’indexabilité technique d’une page ne prouve pas son indexation chez Google.

Les audits hebdomadaires sont en HTML, sans rendu JavaScript payant, jusqu’à 1 000 pages. Leur activation et celle de la découverte mensuelle de liens se font dans l’interface. Le planificateur de production doit rester en fonctionnement ; `vite dev` ne constitue pas un hébergement permanent. Les requêtes de mots-clés et les prompts se choisissent dans leurs écrans dédiés : commencer avec environ 30 mots-clés et 20 prompts pertinents par site, puis vérifier le coût réel avant d’étendre.

## Budget

Valeurs initiales : **15 €/mois pour les données et 5 €/mois pour l’IA**. La configuration est compatible avec Hobby et ne demande pas d’abonnement Vercel Pro. Les consommations Vercel/Queues/Blob/PostgreSQL, les taxes et les prépaiements fournisseurs restent externes au registre. Le plafond global souhaité de 50 € n’est donc pas garanti par le budget API ; surveiller aussi les alertes et limites des services d’hébergement.

Les périodes budgétaires sont mensuelles en UTC. Le taux USD→EUR est un taux de planification réglable, pas un cours de change en direct. Chaque appel payé réserve son plafond avant de partir. Un résultat connu ajuste le coût ; un transport interrompu ou un coût incertain conserve la réserve. Un dépassement du tarif attendu suspend les nouvelles opérations payantes. Le bouton de suspension n’annule pas un appel déjà parti.

Les garde-fous privés prennent en charge DataForSEO direct et un modèle texte OpenRouter au tarif borné. Les routes dont le coût maximal n’est pas vérifiable sont refusées. Les relais `TREG_API_TOKEN`, endpoints OpenRouter personnalisés, modèles arbitraires et rendu JavaScript payant sont donc désactivés dans ce mode. Les clés déjà configurées chez ces fournisseurs ne sont jamais nécessaires pour utiliser les imports, les actions ou le cockpit.

## MCP et skills

Le serveur MCP amont reste disponible à `/mcp`, protégé par le mode d’authentification de l’application. La page **Agent setup** donne l’URL et les liens de configuration. Les douze skills de workflow amont sont conservées comme ressources applicatives dans `plugins/openseo/skills`, notamment audit SEO, visibilité IA, recherche de mots-clés et prospection de liens. Elles ne sont pas installées automatiquement comme instructions de Codex.

Les nouveaux écrans de suivi utilisent des fonctions serveur avec contrôle de projet et d’organisation ; ils n’ajoutent pas encore leurs propres outils MCP. Les opérations payantes du MCP amont passent par les mêmes fournisseurs et contrôles de budget.

## Validation

```sh
pnpm types:check
pnpm test
pnpm build:vercel
```

Le parcours navigateur privé est décrit dans le [guide Vercel](VERCEL.md). Il utilise une base de test et n’effectue ni recherche payante, ni envoi de message, ni modification des sites. Les tests locaux ne remplacent pas un contrôle du déploiement avec ses véritables services.
