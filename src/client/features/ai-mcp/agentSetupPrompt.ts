import updatePrompt from "./agentUpdatePrompt.md?raw";

export const agentUpdatePrompt = updatePrompt.trim();

// Product help is independent from the development agent's control files.
export function getAgentSetupPrompt(origin: string) {
  return `Connecte mon assistant à mon instance privée SEO/GEO : ${origin}/mcp.

Consulte la documentation du client et https://openseo.so/docs/mcp pour configurer cette connexion personnalisée. Le plugin public OpenSEO cible son service hébergé, pas cette instance.

Utilise OAuth si le client le permet. Sinon, je peux créer une clé dans ${origin}/settings et la saisir dans les paramètres secrets du client. Ne demande pas de clé dans le chat et ne l'enregistre pas dans un dépôt.

Après connexion, vérifie l'identité et la liste des projets avec les outils de lecture gratuits. Ne lance aucune recherche payante pendant la configuration. Les méthodes SEO publiques sont disponibles sur https://openseo.so/docs/skills/setup ; n'installe aucun skill interne de développement.`;
}
