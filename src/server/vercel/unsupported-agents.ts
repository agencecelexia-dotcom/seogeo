// Only the Vercel build aliases the Workers server entry points here. Browser
// hooks are separate modules; external MCP uses the official Web transport.
export function getAgentByName(): never {
  throw new Error(
    "Le chat intégré et son transfert nécessitent le moteur Cloudflare Agents. Utilisez la connexion MCP sur Vercel.",
  );
}

export function createMcpHandler(): never {
  throw new Error(
    "Cloudflare Agents MCP is unavailable on Vercel; use the Node MCP transport.",
  );
}
