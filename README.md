# SEO / GEO — plateforme privée multisite

Une seule application pour suivre les sites, leurs pages, les audits SEO, les observations GEO, les actions prioritaires, les opportunités de backlinks et les coûts des collectes.

## Un projet Vercel, un lien

Importer ce dépôt dans **un seul projet Vercel**, nommé par exemple `seogeo`, avec **Root Directory = `.`** (racine du dépôt).

L’interface, le backend, l’authentification, le MCP et les tâches programmées appartiennent au même déploiement. Les différents sites suivis sont accessibles depuis cette application. PostgreSQL et Blob sont des ressources de stockage connectées au projet.

```sh
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` construit la cible Vercel. Les variables, migrations et la création du compte administrateur sont détaillées dans le [guide Vercel](docs/VERCEL.md). Les crons toutes les cinq minutes demandent Vercel Pro.

- [Fonctionnalités de la V1](docs/V1_PRIVE.md)
- [Configuration Vercel](docs/VERCEL.md)
- [Variables à renseigner](.env.vercel.example)
- [Imports CSV SEO / GEO](docs/IMPORTS.md)
- [Performance des pages](docs/PERFORMANCE.md)

Le site marketing amont a été retiré de cette adaptation. `tests/badseo/` conserve uniquement un site de test local utilisant les dépendances du projet principal ; il n’a pas de déploiement Vercel séparé. Les variantes Cloudflare/Docker restent disponibles pour référence, avec `build:cloudflare` et `build:standalone`.

## Origine et licence

Adaptation d’[OpenSEO](https://github.com/every-app/open-seo), révision `af3f995fe3ebbe21298df152465a5436842354ee`, sous [licence MIT](LICENSE). Le code marketing d’origine reste disponible dans l’amont et dans l’historique de ce dépôt.
