import { Parser } from "htmlparser2";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { readBodyCapped } from "@/server/lib/audit/html-response";
import { publicFetch } from "@/server/lib/public-fetch";
import type { LinkCheckStatus } from "@/types/schemas/workbench";

type LinkCheck = {
  status: LinkCheckStatus;
  detail: string;
  rel: string | null;
};
const normalize = (value: string, base?: string) => {
  const url = new URL(value, base);
  url.hash = "";
  return url.href;
};

/** HTML-only check: blocked, truncated and non-HTML responses are unknown, not lost links. */
export async function checkProspectLink(
  sourceUrl: string,
  targetUrl: string,
): Promise<LinkCheck> {
  try {
    let current = sourceUrl;
    const signal = AbortSignal.timeout(20_000);
    for (let hop = 0; hop < 6; hop++) {
      current = await normalizeAndValidateStartUrl(current);
      const response = await publicFetch(current, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": "SEO-GEO-LinkCheck/1.0", Accept: "text/html" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location)
          return {
            status: "error",
            detail: "Redirection sans destination.",
            rel: null,
          };
        current = new URL(location, current).href;
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel();
        return {
          status: "missing",
          detail: `Page source indisponible (HTTP ${response.status}).`,
          rel: null,
        };
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      ) {
        await response.body?.cancel();
        return {
          status: "error",
          detail: `HTML non vérifiable (HTTP ${response.status}).`,
          rel: null,
        };
      }
      const html = await readBodyCapped(response, 2 * 1024 * 1024);
      if (html === null)
        return {
          status: "error",
          detail: "Page trop volumineuse : contrôle incomplet.",
          rel: null,
        };
      let base = current;
      let baseFound = false;
      const links: { href: string; rel: string }[] = [];
      const parser = new Parser({
        onopentag(name, attrs) {
          if (name === "base" && attrs.href && !baseFound) {
            try {
              base = new URL(attrs.href, current).href;
              baseFound = true;
            } catch {
              /* Ignore malformed HTML base. */
            }
          }
          if (name === "a" && attrs.href)
            links.push({ href: attrs.href, rel: attrs.rel ?? "" });
        },
      });
      parser.end(html);
      const target = normalize(targetUrl);
      const link = links.find(({ href }) => {
        try {
          return normalize(href, base) === target;
        } catch {
          return false;
        }
      });
      return link
        ? {
            status: "present",
            detail: `Lien trouvé dans le HTML de ${current}.`,
            rel: link.rel || null,
          }
        : {
            status: "missing",
            detail:
              "Lien exact non trouvé dans le HTML. Le rendu JavaScript n’a pas été vérifié.",
            rel: null,
          };
    }
    return {
      status: "error",
      detail: "Trop de redirections : contrôle interrompu.",
      rel: null,
    };
  } catch {
    return {
      status: "error",
      detail:
        "Page inaccessible ou cible réseau refusée. Aucun constat de perte de lien.",
      rel: null,
    };
  }
}
