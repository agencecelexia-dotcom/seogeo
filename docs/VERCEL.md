# Déployer SEO / GEO sur Vercel

**Un seul projet Vercel et une seule URL pour toute la plateforme.** Le frontend et le backend utilisent TanStack Start, Nitro et les fonctions Node de Vercel. PostgreSQL conserve les données, les sessions, le cache OAuth, les files de travail et leurs points de reprise. Vercel Blob conserve les fichiers en accès **privé**. Ce déploiement ne demande aucun compte Cloudflare.

À l’import, sélectionner uniquement la **racine `.`** du dépôt, avec le nom de projet `seogeo`. Les pages, `/api/*`, `/mcp` et les deux routes de cron utilisent ce même domaine. Les crons sont deux routes internes de la même application, pas deux projets à déployer.

Si Vercel affiche encore trois dossiers depuis l’ancien commit, actualiser la page d’import : le site marketing a été retiré et le site de test BadSEO ne possède plus de package séparé. On peut aussi sélectionner directement la racine et ignorer les anciennes suggestions. Voir le réglage [Root Directory de Vercel](https://vercel.com/docs/builds/configure-a-build#root-directory).

La configuration est compatible avec **Vercel Hobby, avec Fluid Compute activé**. `/api/cron` lance les collectes planifiées chaque jour à partir de 03 h UTC ; `/api/cron/workflows` récupère les éventuels travaux non distribués à partir de 04 h UTC. Sur Hobby, ces horaires ont une précision d’une heure. Les fonctions sont limitées à 300 secondes. Voir [les limites des crons](https://vercel.com/docs/cron-jobs/usage-and-pricing) et [la durée des fonctions](https://vercel.com/docs/functions/configuring-functions/duration).

Les audits lancés depuis l’application démarrent via **Vercel Queues** et reprennent automatiquement par tranches, sans attendre le cron du lendemain et sans garder le navigateur ouvert. PostgreSQL conserve leurs points de reprise. Nitro génère le consommateur privé dans le même projet : aucune seconde application ni seconde URL à créer. Queues est disponible en bêta sur tous les plans ; son authentification est automatique sur Vercel. Consulter [la documentation Queues](https://vercel.com/docs/queues) et [ses quotas](https://vercel.com/docs/queues/pricing).

## Créer les ressources

1. Pousser ce dépôt dans votre dépôt Git privé, puis l’importer dans Vercel. Utiliser Node.js 24, pnpm et la racine du dépôt. `vercel.json` définit la commande `pnpm build:vercel` et le cron.
2. Depuis Storage / Marketplace, connecter une base PostgreSQL, par exemple Neon. Utiliser sa connexion poolée pour `DATABASE_URL`. Garder la base et les fonctions dans des régions proches.
3. Créer un store Vercel Blob **privé** et le connecter au projet en Production. La connexion fournit `BLOB_STORE_ID` et utilise l’authentification automatique OIDC de Vercel.
4. Ajouter les variables ci-dessous à l’environnement Production. Les previews doivent utiliser une base et un store distincts si vous leur donnez des identifiants ; elles ne doivent pas travailler sur les données de production.

Les suggestions **Turso** et **PostHog** de l’écran d’import ne sont pas nécessaires à cette cible. Utiliser PostgreSQL et Blob privé comme indiqué ci-dessus. Vérifier que **Fluid Compute** est activé dans les paramètres du projet pour bénéficier des fonctions de 300 secondes.

Avec le CLI Vercel à jour, depuis le dépôt lié au bon projet et à la bonne équipe :

```sh
vercel storage create seogeo-files --type blob --access private --region iad1
vercel storage connect seogeo-files --environment production --yes
```

Réutiliser le store s’il existe déjà : sa création et sa connexion sont deux opérations distinctes. OIDC évite de gérer un jeton statique. En alternative, ajouter `--auth token --add-rw-token` à la commande de connexion pour fournir `BLOB_READ_WRITE_TOKEN`. Voir la [documentation du CLI Storage](https://vercel.com/docs/cli/storage).

### Si la page indique « Configuration Vercel incomplète »

Le code a été déployé, mais ses ressources ne sont pas encore configurées. Dans **Storage**, créer ou connecter PostgreSQL (par exemple Neon), puis dans **Environment Variables**, renseigner les valeurs de la table pour **Production**. Ne jamais mettre ces secrets dans le dépôt Git ou dans un message de chat.

Si l’intégration fournit seulement `POSTGRES_URL`, cette connexion est aussi reconnue par le runtime et les migrations. `BETTER_AUTH_URL` peut être omise en production lorsque Vercel expose `VERCEL_PROJECT_PRODUCTION_URL` : l’application reprend alors ce domaine HTTPS fourni par la plateforme. Une valeur explicite reste prioritaire ; les previews et le développement doivent toujours avoir leur propre `BETTER_AUTH_URL`. Voir les [variables système Vercel](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_production_url).

Générer séparément `BETTER_AUTH_SECRET`, `CRON_SECRET` et `OPENSEO_OPERATOR_SECRET` avec `openssl rand -hex 32`, puis les enregistrer dans Vercel. Appliquer les migrations et créer le premier compte avec les étapes ci-dessous. Après ajout des variables, lancer **Redeploy** : les déploiements déjà construits conservent leurs anciennes valeurs, comme l’indique la [documentation Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

| Variable                  | Valeur attendue                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | URL PostgreSQL poolée fournie par l’intégration.                                                                                               |
| `POSTGRES_DATABASE_URL`   | Facultative : connexion directe utilisée uniquement pour les migrations.                                                                       |
| `BETTER_AUTH_URL`         | Origine HTTPS stable de l’application, sans chemin ; détectée depuis Vercel en production si elle est omise.                                   |
| `BETTER_AUTH_SECRET`      | Secret aléatoire d’au moins 32 caractères, conservé lors des redéploiements. Chiffrer et déchiffrer les connexions Google dépend de ce secret. |
| `OPENSEO_OPERATOR_SECRET` | Autre secret aléatoire d’au moins 32 caractères pour l’administration des comptes.                                                             |
| `CRON_SECRET`             | Autre secret aléatoire d’au moins 32 caractères. Vercel le transmet dans l’en-tête Authorization du cron.                                      |
| `BLOB_STORE_ID`           | Identifiant du store Blob privé, fourni par sa connexion au projet ; utilisé avec l’authentification OIDC automatique.                         |
| `BLOB_READ_WRITE_TOKEN`   | Facultatif : jeton du store privé si la connexion utilise un jeton statique à la place d’OIDC.                                                 |

Générer chaque secret séparément avec `openssl rand -hex 32`. Conserver leurs valeurs dans un gestionnaire de secrets ; ne pas les committer. `.env.vercel.example` contient uniquement les noms et commentaires. Le mode mot de passe, PostgreSQL et la désactivation de télémétrie sont imposés par cette cible.

## Appliquer les migrations et créer le compte

Sur votre poste, installer les dépendances et renseigner les variables dans `.env.local` (ignoré par Git). Utiliser la base du bon environnement :

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:pg
pnpm build:vercel
```

La CI GitHub vérifie les types, les tests et le build Vercel ; elle ne déploie pas Cloudflare. L’ancien packaging de release Every App est désormais manuel.

Les migrations ne tournent pas automatiquement dans chaque build de preview. Après leur application, lancer le déploiement Production dans Vercel. La première inscription publique est fermée : seul l’opérateur peut créer le premier compte. Depuis un terminal zsh, charger le secret dans l’environnement puis saisir le mot de passe sans l’afficher :

```sh
export OPENSEO_URL=https://votre-projet.vercel.app
read -rs 'OPENSEO_OPERATOR_SECRET?Secret opérateur : '; echo
export OPENSEO_OPERATOR_SECRET
read -rs 'seogeo_password?Mot de passe du compte : '; echo
printf '%s' "$seogeo_password" | pnpm vercel:admin create-user vous@example.com "Thomas"
unset seogeo_password OPENSEO_OPERATOR_SECRET
```

Se connecter, ajouter les trois sites depuis la vue d’ensemble, puis activer seulement les collectes souhaitées. Les variables Google, DataForSEO, OpenRouter et Performance figurent dans le [guide V1](V1_PRIVE.md). Elles ne sont pas nécessaires aux actions manuelles et aux imports. Le secret opérateur peut être retiré de Vercel après le bootstrap puis rétabli lors d’une opération d’administration.

## Fonctionnement et limites

- Les audits HTML, suivis de positions, suivis IA et SEO local utilisent une file PostgreSQL avec étapes persistées, bail d’exécution et reprise. Une étape payante dont le résultat est incertain n’est pas rejouée automatiquement lorsqu’elle interdit les retries.
- Les collectes Google quotidiennes et la prospection mensuelle activée dans l’interface sont distribuées par la même file. La prospection s’arrête avant la limite de temps et signale une collecte partielle si nécessaire ; les prospects déjà enregistrés restent disponibles.
- Le crawler Node résout et vérifie les adresses publiques puis fixe cette résolution pour la connexion ; chaque redirection est revérifiée.
- Les fichiers restent privés, avec index PostgreSQL et suppression différée des anciennes versions. Ne pas supprimer la base en conservant seulement Blob : les deux sont nécessaires à une restauration.
- Le chat intégré SAM est désactivé sur Vercel. Connecter un agent externe à `/mcp` depuis **Agent setup** ; les outils et les skills applicatifs restent disponibles.
- Le budget API initial est de 20 €/mois. Il exclut PostgreSQL, Blob, les fonctions, Queues, les taxes et les éventuels abonnements d’infrastructure. Aucun abonnement Pro n’est requis par cette configuration. Configurer les alertes Vercel et les limites du fournisseur PostgreSQL ; la cible globale de 50 € demande ce suivi séparé.

Contrôler `/api/health`, la page **Collecte et budget**, les logs de fonctions, le consommateur du topic `seogeo-workflows` dans Queues et l’exécution du cron après la mise en ligne. Un appel au cron sans son secret doit renvoyer 401. Le cron de récupération republie au maximum 100 travaux en attente par passage ; une indisponibilité de Queues peut retarder leur reprise jusqu’à ce passage. Sauvegarder PostgreSQL, les fichiers Blob et les secrets avant une mise à jour. Le dépôt ne contient ni vos comptes connectés ni vos données de production.

## Développement Node local

Un serveur PostgreSQL de développement basé sur PGlite est inclus. Il conserve ses données dans `.local/postgres`, ignoré par Git. Il sert à tester l’application, pas à héberger la production.

```sh
pnpm db:local:postgres
```

Dans un autre terminal, copier `.env.vercel.example` vers `.env.local`, mettre `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres`, `BETTER_AUTH_URL=http://127.0.0.1:3104` et générer les trois secrets. Laisser `POSTGRES_DATABASE_URL` vide et mettre `POSTGRES_POOL_MAX=1` pour le serveur PGlite (une seule connexion). PostgreSQL de production utilise trois connexions par instance par défaut. Puis :

```sh
pnpm db:migrate:pg
pnpm dev:vercel
```

Créer le compte par la commande opérateur ci-dessus avec l’URL locale. Le cron Vercel n’existe pas en développement : appeler les deux routes manuellement avec leur Bearer secret pour faire avancer les travaux. Pour tester la compilation Node : `pnpm build:node`, puis `node --env-file=.env.local .output/server/index.mjs` avec `PORT=3104` et `HOST=127.0.0.1`.

Arrêter le serveur applicatif avant d’appliquer une migration à PGlite, afin de libérer son unique connexion.

Pour le parcours Chrome local, créer un compte de test, fournir `PRIVATE_E2E_EMAIL` et `PRIVATE_E2E_PASSWORD` au processus de test, puis exécuter `pnpm test:e2e:private` avec l’app sur le port 3104. Ce test ajoute des lignes `[Validation V1]` ; utiliser une base réservée aux tests.

Les fichiers Blob nécessitent un store distinct connecté à Development ; les actions, imports et budgets n’en ont pas besoin. Pour utiliser OIDC localement, récupérer les variables Development avec `vercel env pull .env.local --environment development --yes` ; relancer cette commande lorsque le jeton temporaire expire. `BLOB_READ_WRITE_TOKEN` reste une alternative pour ce store de développement. Ne pas utiliser les clés de production pour les tests. Voir la [documentation du CLI Env](https://vercel.com/docs/cli/env).
