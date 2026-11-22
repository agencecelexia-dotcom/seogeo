import Papa from "papaparse";
import { sortBy } from "remeda";
import {
  IMPORT_MAX_ROWS,
  importInputSchema,
  type ImportInput,
  type ImportPreview,
  type ImportRow,
} from "@/shared/data-imports";

const aliases = {
  page: [
    "page",
    "pages",
    "top pages",
    "url",
    "page url",
    "cited page",
    "cited pages",
    "url de la page",
    "pages les plus populaires",
  ],
  date: ["date", "dates", "day", "jour"],
  query: [
    "query",
    "queries",
    "grounding query",
    "grounding queries",
    "requete",
    "requetes",
  ],
  country: ["country", "countries", "pays"],
  device: ["device", "devices", "appareil", "appareils"],
  impressions: [
    "impressions",
    "impression",
    "ai impressions",
    "impressions ia",
  ],
  citations: [
    "citations",
    "citation count",
    "total citations",
    "ai citations",
    "nombre de citations",
  ],
  source: [
    "source url",
    "referring page url",
    "referring page",
    "url from",
    "url source",
    "page source",
  ],
  target: [
    "target url",
    "target",
    "url to",
    "destination url",
    "url cible",
    "page cible",
  ],
  anchor: ["anchor", "anchor text", "ancre", "texte d ancre"],
  rel: ["rel", "link attributes", "attributs"],
  firstSeen: ["first seen", "date first seen", "premiere detection"],
  lastSeen: ["last seen", "date last seen", "derniere detection"],
} satisfies Record<string, string[]>;

function header(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_'’-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function date(value: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : value.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    Number.isNaN(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`Date invalide : ${value}. Utiliser AAAA-MM-JJ.`);
  }
  return iso;
}

function url(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL invalide : ${value.slice(0, 100)}`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error("Les URL doivent utiliser HTTP(S), sans identifiants.");
  parsed.hash = "";
  return parsed.href;
}

function count(value: string): number {
  const compact = value.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\d+$/.test(compact) && !/^\d{1,3}(,\d{3})+$/.test(compact))
    throw new Error(`Compteur entier attendu : ${value}`);
  const result = Number(compact.replaceAll(",", ""));
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Compteur hors limites.");
  return result;
}

function isProjectUrl(value: string, domain: string) {
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const projectHost = new URL(
    domain.includes("://") ? domain : `https://${domain}`,
  ).hostname
    .toLowerCase()
    .replace(/^www\./, "");
  return host === projectHost || host.endsWith(`.${projectHost}`);
}

/** Parse again on commit: the client preview is never trusted as input data. */
export function parseImport(
  input: ImportInput,
  projectDomain: string,
): ImportPreview {
  importInputSchema.parse(input);
  const result: ImportPreview = {
    headers: [],
    totalRows: 0,
    duplicates: 0,
    rows: [],
    errors: [],
  };
  const error = (row: number, message: string) => {
    if (result.errors.length < 50) result.errors.push({ row, message });
  };
  let start: string;
  let end: string;
  try {
    start = date(input.periodStart);
    end = date(input.periodEnd);
    if (start > end)
      throw new Error("La date de début doit précéder la date de fin.");
  } catch (cause) {
    error(0, cause instanceof Error ? cause.message : "Période invalide.");
    return result;
  }
  const parsed = Papa.parse<string[]>(input.csv.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
  });
  for (const issue of parsed.errors) {
    // A single-column report is valid (e.g. an impressions total).
    if (issue.code !== "UndetectableDelimiter")
      error((issue.row ?? 0) + 1, issue.message);
  }
  const [rawHeaders, ...data] = parsed.data;
  if (!rawHeaders?.length) {
    error(1, "Le fichier ne contient pas de colonnes.");
    return result;
  }
  result.headers = rawHeaders;
  result.totalRows = data.length;
  if (data.length > IMPORT_MAX_ROWS) {
    error(
      0,
      `Maximum ${IMPORT_MAX_ROWS} lignes par import ; diviser le fichier.`,
    );
    return result;
  }
  if (data.length === 0) {
    error(0, "Le fichier ne contient aucune ligne de données.");
    return result;
  }
  const normalized = rawHeaders.map(header);
  if (new Set(normalized).size !== normalized.length) {
    error(1, "Des en-têtes de colonne sont répétés.");
    return result;
  }
  const index = (key: keyof typeof aliases) =>
    normalized.findIndex((name) => aliases[key].includes(name));
  const value = (cells: string[], key: keyof typeof aliases) =>
    (cells[index(key)] ?? "").trim();
  const optional = (cells: string[], key: keyof typeof aliases) =>
    value(cells, key) || null;
  const metric =
    input.source === "gsc_generative" ? "impressions" : "citations";
  const required =
    input.source === "backlinks"
      ? (["source", "target"] as const)
      : ([metric] as const);
  for (const key of required)
    if (index(key) < 0)
      error(1, `Colonne requise absente : ${aliases[key][0]}.`);
  if (result.errors.length) return result;
  const seen = new Map<string, string>();
  for (const [offset, cells] of data.entries()) {
    try {
      if (cells.length !== rawHeaders.length)
        throw new Error(
          "Le nombre de cellules ne correspond pas aux en-têtes.",
        );
      if (cells.some((cell) => cell.length > 4096))
        throw new Error("Une cellule dépasse 4 096 caractères.");
      let row: ImportRow;
      if (input.source === "backlinks") {
        const sourceUrl = url(value(cells, "source"));
        const targetUrl = url(value(cells, "target"));
        if (!isProjectUrl(targetUrl, projectDomain))
          throw new Error("L’URL cible n’appartient pas au site sélectionné.");
        const firstSeen = optional(cells, "firstSeen");
        const lastSeen = optional(cells, "lastSeen");
        row = {
          kind: "backlink",
          rowKey: JSON.stringify([sourceUrl, targetUrl]),
          sourceUrl,
          targetUrl,
          anchor: optional(cells, "anchor"),
          rel: optional(cells, "rel"),
          firstSeen: firstSeen ? date(firstSeen.slice(0, 10)) : null,
          lastSeen: lastSeen ? date(lastSeen.slice(0, 10)) : null,
        };
      } else {
        const rawPage = optional(cells, "page");
        const pageUrl = rawPage ? url(rawPage) : null;
        if (pageUrl && !isProjectUrl(pageUrl, projectDomain))
          throw new Error("La page n’appartient pas au site sélectionné.");
        const rawDate = optional(cells, "date");
        const rowDate = rawDate ? date(rawDate) : null;
        if (rowDate && (rowDate < start || rowDate > end))
          throw new Error(
            "La date de la ligne est hors de la période sélectionnée.",
          );
        const query = optional(cells, "query"),
          country = optional(cells, "country"),
          device = optional(cells, "device");
        const periodStart = rowDate ?? start,
          periodEnd = rowDate ?? end;
        row = {
          kind: "geo",
          rowKey: JSON.stringify([
            periodStart,
            periodEnd,
            pageUrl,
            query,
            country,
            device,
          ]),
          periodStart,
          periodEnd,
          pageUrl,
          query,
          country,
          device,
          metric,
          value: count(value(cells, metric)),
        };
      }
      const serialized = JSON.stringify(row);
      const previous = seen.get(row.rowKey);
      if (previous === serialized) {
        result.duplicates++;
        continue;
      }
      if (previous)
        throw new Error(
          "Deux lignes ont les mêmes dimensions mais des valeurs différentes.",
        );
      seen.set(row.rowKey, serialized);
      result.rows.push(row);
    } catch (cause) {
      error(
        offset + 2,
        cause instanceof Error ? cause.message : "Ligne invalide.",
      );
    }
  }
  return result;
}

export async function importFingerprint(
  input: ImportInput,
  rows: ImportRow[],
): Promise<string> {
  const text = JSON.stringify([
    input.source,
    input.periodStart,
    input.periodEnd,
    sortBy(
      rows.map((row) => JSON.stringify(row)),
      (value) => value,
    ),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
