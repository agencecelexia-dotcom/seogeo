# Performance des pages

Ouvrir le dossier d’une page puis choisir **Analyser la performance**. L’application transmet son URL publique à Google. Les résultats restent privés dans votre interface et ne sont pas conservés dans un historique permanent.

Le panneau sépare les deux méthodes :

- **PageSpeed Insights / Lighthouse** : simulation ponctuelle, mobile ou ordinateur, score performance, LCP, CLS et TBT. Un quota, une page inaccessible ou un délai peut empêcher l’analyse.
- **Chrome UX Report (CrUX)** : données agrégées d’utilisateurs Chrome éligibles, 75e percentile, fenêtre de 28 jours et appareil sélectionné. Les données concernent la page indiquée ; elles ne sont pas remplacées par celles de l’origine. Une couverture absente est inconnue, pas égale à zéro. TBT et INP mesurent des choses différentes.

La clé `GOOGLE_PAGESPEED_API_KEY` est facultative et recommandée pour PageSpeed. CrUX nécessite `GOOGLE_CRUX_API_KEY`, issue d’un projet Google Cloud où **Chrome UX Report API** est activée. Configurer ces secrets uniquement côté serveur. Ils ne sont pas envoyés au navigateur. Les quotas Google s’appliquent ; aucun fournisseur payant n’est utilisé par ce panneau.

Les appels utilisent les API Google officielles, sans code tiers copié. Les données restent soumises aux conditions de ces services. Références : [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started), [API CrUX et couverture](https://developer.chrome.com/docs/crux/api), [conditions des API Google](https://developers.google.com/terms).
