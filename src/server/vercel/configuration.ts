const required = [
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
] as const;

// Only platform-provided values are trusted here; Host and forwarded headers
// must never choose the authentication origin. Previews need an explicit URL.
export function applyVercelEnvironmentDefaults() {
  if (process.env.VERCEL !== "1") return;
  if (!process.env.DATABASE_URL?.trim()) {
    const postgres = process.env.POSTGRES_URL?.trim();
    if (postgres && /^postgres(?:ql)?:\/\//.test(postgres))
      process.env.DATABASE_URL = postgres;
  }
  if (
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.VERCEL_ENV !== "production"
  )
    return;
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!domain) return;
  try {
    const url = new URL(`https://${domain}`);
    if (
      url.host === domain &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      process.env.BETTER_AUTH_URL = url.origin;
  } catch {
    // Leave an invalid or absent platform value for the setup instructions.
  }
}

const instructions: Record<(typeof required)[number], string> = {
  DATABASE_URL:
    "Connecter une base PostgreSQL, par exemple Neon, dans Storage / Marketplace. Utiliser sa connexion poolée pour DATABASE_URL.",
  BETTER_AUTH_URL:
    "Renseigner l’URL HTTPS publique de cette application, sans chemin. En production, le domaine fourni par Vercel est utilisé automatiquement lorsqu’il est disponible.",
  BETTER_AUTH_SECRET:
    "Créer un secret aléatoire d’au moins 32 caractères. Le conserver : les connexions Google et les sessions en dépendent.",
  CRON_SECRET:
    "Créer un autre secret aléatoire d’au moins 32 caractères pour protéger les tâches planifiées.",
};

export function configurationResponse(request: Request): Response | null {
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (!missing.length) return null;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/mcp" ||
    !request.headers.get("accept")?.includes("text/html")
  )
    return Response.json(
      { error: "Configuration Vercel incomplète", missing },
      { status: 503, headers },
    );
  // No environment values, request URL, database credentials or secret values
  // are rendered. This page works before either database or auth is available.
  const rows = required
    .map(
      (key) =>
        `<li><div><code>${key}</code><span class="${missing.includes(key) ? "pending" : "done"}">${missing.includes(key) ? "À renseigner" : "Renseignée"}</span></div><p>${instructions[key]}</p></li>`,
    )
    .join("");
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Terminer l’installation · SEO / GEO</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f9;color:#18242b;font:16px/1.65 system-ui,-apple-system,sans-serif}main{max-width:900px;margin:64px auto;padding:0 24px 48px}.brand{font-size:14px;font-weight:750;letter-spacing:.12em;color:#047857}.eyebrow{display:inline-block;border:1px solid #cbd5e1;padding:4px 10px;border-radius:20px;font-size:12px;margin:20px 0 0}h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.04em;margin:18px 0}h2{font-size:20px;margin:0 0 12px}.lead{color:#52616b;max-width:660px;margin-bottom:28px}.panel{background:white;border:1px solid #dce3e8;border-radius:16px;padding:28px;margin-top:20px}ol{padding:0;list-style:none;margin:0}li{padding:18px 0;border-bottom:1px solid #e6ebef}li:last-child{border:0;padding-bottom:0}li:first-child{padding-top:0}li>div{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}li p{margin:8px 0 0;color:#52616b;font-size:14px}code{font-size:13px;overflow-wrap:anywhere}span.pending,span.done{font-size:12px;border-radius:12px;padding:2px 9px;font-weight:600}.pending{background:#fff4db;color:#8a5100}.done{background:#e8f5ee;color:#166534}a{color:#046c55;text-underline-offset:3px}.button{display:inline-block;padding:10px 17px;background:#047857;color:white;text-decoration:none;border-radius:9px;font-weight:600}.links{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.step{margin:10px 0}.small{font-size:13px;color:#52616b}pre{padding:12px 14px;background:#f2f5f7;border-radius:8px;overflow:auto}@media(max-width:600px){main{margin:28px auto;padding:0 16px 28px}.panel{padding:20px}.links{gap:14px}}
</style></head><body><main><div class="brand">SEO / GEO</div><div class="eyebrow">Installation à terminer</div><h1>Le déploiement est prêt.<br>Connectons les services.</h1><p class="lead">Le code est en ligne. Pour ouvrir ta plateforme privée, ajoute la base de données et les secrets dans les paramètres du projet Vercel, puis redéploie.</p><div class="links"><a class="button" href="https://vercel.com/dashboard">Ouvrir Vercel</a><a href="https://github.com/agencecelexia-dotcom/seogeo/blob/main/docs/VERCEL.md">Guide d’installation</a></div><section class="panel"><h2>1. Renseigner les variables de production</h2><ol>${rows}</ol><p class="small">Dans le projet : Environment Variables → Production. Aucun secret ne doit être saisi sur cette page ni ajouté au dépôt Git.</p></section><section class="panel"><h2>2. Préparer les données et le premier compte</h2><p class="step">Connecter un store <strong>Vercel Blob privé</strong> pour les fichiers. Ajouter un troisième secret, <code>OPENSEO_OPERATOR_SECRET</code>, pour créer le premier compte administrateur.</p><p class="step">Dans un terminal local, générer chaque secret séparément :</p><pre><code>openssl rand -hex 32</code></pre><p class="step">Charger la connexion PostgreSQL dans <code>.env.local</code>, puis créer les tables :</p><pre><code>pnpm db:migrate:pg</code></pre><p class="step">Redéployer le projet pour appliquer les variables, puis créer le compte avec la commande <code>pnpm vercel:admin</code> détaillée dans le guide.</p><p class="small">Turso et PostHog ne sont pas requis. La plateforme reste sur un seul projet Vercel et une seule URL.</p></section><p class="small">L’application reste fermée tant que sa configuration est incomplète. Les indicateurs ci-dessus confirment la présence des variables, pas encore la connexion à la base.</p></main></body></html>`,
    {
      status: 503,
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    },
  );
}
