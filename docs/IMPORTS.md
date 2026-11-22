# Importer des rapports SEO et GEO

Dans un projet, ouvrir **Imports**, choisir la source et reprendre exactement la période du rapport exporté. Choisir un fichier CSV/TSV ou coller son contenu, puis utiliser **Prévisualiser**. Aucun enregistrement n’a lieu avant **Confirmer l’import**.

Les séparateurs virgule, point-virgule et tabulation sont reconnus. La limite est de 1 000 lignes et 1 Mo par fichier. Les URL cibles doivent appartenir au domaine du projet ou à ses sous-domaines.

## Formats

Pour Google Search Console — performances IA générative :

```csv
Pages,Impressions
https://votre-site.fr/services,123
```

Pour Bing AI Performance :

```csv
Page URL,Total citations
https://votre-site.fr/services,12
```

Les dimensions facultatives `Date`, `Query` / `Grounding queries`, `Country` et `Device` sont conservées lorsqu’elles figurent dans le fichier. Les noms français usuels sont reconnus. Les dates acceptées sont `AAAA-MM-JJ` et `JJ/MM/AAAA`.

Pour un export de backlinks :

```csv
Source URL,Target URL,Anchor,Rel,First seen,Last seen
https://partenaire.fr/ressources,https://votre-site.fr/,Votre entreprise,nofollow,2026-10-01,2026-11-21
```

Seules `Source URL` et `Target URL` sont obligatoires. Un lien importé est une observation déclarée par le fournisseur, pas une vérification actuelle de la page.

## Lire les résultats

Sans colonne Date, les compteurs couvrent toute la période saisie. Les rapports par page, pays, appareil ou requête peuvent se recouvrir : leurs lignes ne doivent pas être additionnées pour calculer un total général. Les impressions Google et citations Bing sont affichées séparément du panel de questions IA.

Les lignes identiques d’un fichier sont dédupliquées. Un fichier déjà importé, même renommé ou réordonné, ne crée pas de nouvelles données. Réimporter les mêmes dimensions avec une valeur différente remplace la valeur de l’observation. Deux lignes contradictoires dans un seul fichier sont refusées.

L’écran conserve les 30 imports récents et affiche jusqu’à 200 observations de chaque catégorie. Les fichiers originaux ne sont pas publiés ni conservés comme pièces jointes ; les valeurs normalisées, leur source et leur période restent dans la base privée.
