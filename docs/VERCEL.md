# Déployer SEO / GEO sur Vercel

**Un seul projet Vercel et une seule URL pour toute la plateforme.** Le frontend et le backend utilisent TanStack Start, Nitro et les fonctions Node de Vercel. PostgreSQL conserve les données, les sessions, le cache OAuth, les files de travail et leurs points de reprise. Vercel Blob conserve les fichiers en accès **privé**. Ce déploiement ne demande aucun compte Cloudflare.

À l’import, sélectionner uniquement la **racine `.`** du dépôt, avec le nom de projet `seogeo`. Les pages, `/api/*`, `/mcp` et les deux routes de cron utilisent ce même domaine. Les crons sont deux routes internes de la même application, pas deux projets à déployer.

Si Vercel affiche encore trois dossiers depuis l’ancien commit, actualiser la page d’import : le site marketing a été retiré et le site de test BadSEO ne possède plus de package séparé. On peut aussi sélectionner directement la racine et ignorer les anciennes suggestions. Voir le réglage [Root Directory de Vercel](https://vercel.com/docs/builds/configure-a-build#root-directory).

Le planificateur appelle `/api/cron` et `/api/cron/workflows` toutes les cinq minutes. La collecte et l’exécution des travaux ont des invocations séparées pour conserver le temps nécessaire aux longues étapes. **Vercel Pro est nécessaire** pour cette fréquence ; Hobby limite les crons à un passage quotidien. Les fonctions sont configurées avec une durée maximale de 800 secondes. Les opérations longues enregistrent leur progression et continuent lors d’un prochain passage. Un travail en attente n’est pas une erreur et peut attendre cinq minutes avant de démarrer. Voir [les limites des crons](https://vercel.com/docs/cron-jobs/usage-and-pricing) et [la durée des fonctions](https://vercel.com/docs/functions/configuring-functions/duration).

## Créer les ressources

1. Pousser ce dépôt dans votre dépôt Git privé, puis l’importer dans Vercel. Utiliser Node.js 24, pnpm et la racine du dépôt. `vercel.json` définit la commande `pnpm build:vercel` et le cron.
2. Depuis Storage / Marketplace, connecter une base PostgreSQL, par exemple Neon. Utiliser sa connexion poolée pour `DATABASE_URL`. Garder la base et les fonctions dans des régions proches.
3. Créer un store Vercel Blob **privé** et connecter sa variable `BLOB_READ_WRITE_TOKEN` au projet.
4. Ajouter les variables ci-dessous à l’environnement Production. Les previews doivent utiliser une base et un store distincts si vous leur donnez des identifiants ; elles ne doivent pas travailler sur les données de production.

| Variable                  | Valeur attendue                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | URL PostgreSQL poolée fournie par l’intégration.                                                                                               |
| `POSTGRES_DATABASE_URL`   | Facultative : connexion directe utilisée uniquement pour les migrations.                                                                       |
| `BETTER_AUTH_URL`         | Origine HTTPS stable de l’application, sans chemin.                                                                                            |
| `BETTER_AUTH_SECRET`      | Secret aléatoire d’au moins 32 caractères, conservé lors des redéploiements. Chiffrer et déchiffrer les connexions Google dépend de ce secret. |
| `OPENSEO_OPERATOR_SECRET` | Autre secret aléatoire d’au moins 32 caractères pour l’administration des comptes.                                                             |
| `CRON_SECRET`             | Autre secret aléatoire d’au moins 32 caractères. Vercel le transmet dans l’en-tête Authorization du cron.                                      |
| `BLOB_READ_WRITE_TOKEN`   | Jeton du store Blob privé.                                                                                                                     |

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
- Le crawler Node résout et vérifie les adresses publiques puis fixe cette résolution pour la connexion ; chaque redirection est revérifiée.
- Les fichiers restent privés, avec index PostgreSQL et suppression différée des anciennes versions. Ne pas supprimer la base en conservant seulement Blob : les deux sont nécessaires à une restauration.
- Le chat intégré SAM est désactivé sur Vercel. Connecter un agent externe à `/mcp` depuis **Agent setup** ; les outils et les skills applicatifs restent disponibles.
- Le budget API initial est de 20 €/mois. Il exclut Vercel Pro, PostgreSQL, Blob, les taxes et les dépassements d’infrastructure. Configurer les alertes Vercel et les limites du fournisseur PostgreSQL ; la cible globale de 50 € demande ce suivi séparé.

Contrôler `/api/health`, la page **Collecte et budget**, les logs de fonctions et l’exécution du cron après la mise en ligne. Un appel au cron sans son secret doit renvoyer 401. Sauvegarder PostgreSQL, les fichiers Blob et les secrets avant une mise à jour. Le dépôt ne contient ni vos comptes connectés ni vos données de production.

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

Les fichiers Blob nécessitent un store de développement ; les actions, imports et budgets n’en ont pas besoin. Ne pas utiliser les clés de production pour les tests.
