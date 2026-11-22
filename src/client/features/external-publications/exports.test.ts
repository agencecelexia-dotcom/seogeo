import { expect, it } from "vitest";
import Papa from "papaparse";
import { sort } from "remeda";
import {
  EXTERNAL_PUBLICATION_STRATEGIES,
  type ExternalPublication,
} from "@/types/schemas/external-publications";
import { googleSearchUrl, PUBLICATION_METHODS, searchQuery } from "./catalog";
import { publicationMarkdown, publicationsCsv } from "./exports";

const publication: ExternalPublication = {
  id: "publication",
  projectId: "project",
  revision: 0,
  strategyId: "community_answer",
  platformName: "Forum",
  targetKeyword: "Isolation",
  targetUrl: "https://site.fr/guide",
  supportUrl: null,
  title: '=HYPERLINK("https://example.test")',
  brief: "+Une réponse utile",
  status: "published",
  publishedUrl: "https://forum.fr/reponse",
  linkPolicy: "ugc",
  publishedAt: "2026-11-22T12:00:00.000Z",
  createdAt: "2026-11-21T12:00:00.000Z",
  updatedAt: "2026-11-22T12:00:00.000Z",
};

it("exports publication fields as formula-safe CSV and preserves the declared link policy", () => {
  const rows = Papa.parse<string[]>(publicationsCsv([publication])).data;
  expect(rows[1][3]).toBe(`'${publication.title}`);
  expect(rows[1][9]).toBe(`'${publication.brief}`);
  expect(rows[1][8]).toBe("Contenu utilisateur (UGC)");
  expect(rows[1][7]).toBe(publication.publishedUrl);
});
it("exports a brief with its source, target and manual observation context", () => {
  const markdown = publicationMarkdown(publication);
  expect(markdown).toContain("Page cible : https://site.fr/guide");
  expect(markdown).toContain("URL publiée : https://forum.fr/reponse");
  expect(markdown).toContain(publication.brief);
  expect(markdown).toContain("déclarée manuellement");
});
it("keeps accented search text and ampersands inside one Google query parameter", () => {
  const query = searchQuery('site:medium.com "{sujet}" "{secteur}"', {
    keyword: "été & isolation",
    sector: 'rénovation "maison"',
    city: "Lyon",
  });
  const url = new URL(googleSearchUrl(query));
  expect(url.origin).toBe("https://www.google.com");
  expect([...url.searchParams.keys()]).toEqual(["q"]);
  expect(url.searchParams.get("q")).toBe(
    'site:medium.com "été & isolation" "rénovation  maison "',
  );
});
it("provides a method for every persisted strategy", () => {
  expect(
    sort(
      PUBLICATION_METHODS.map((method) => method.id),
      (a, b) => a.localeCompare(b),
    ),
  ).toEqual(
    sort(EXTERNAL_PUBLICATION_STRATEGIES, (a, b) => a.localeCompare(b)),
  );
});
