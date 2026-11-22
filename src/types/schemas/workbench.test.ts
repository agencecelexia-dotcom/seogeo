import { expect, it } from "vitest";
import { createActionSchema, saveProspectSchema } from "./workbench";

it("accepts the blank optional proof URL submitted by the action form", () => {
  const result = createActionSchema.safeParse({
    projectId: "project",
    title: "Corriger le titre",
    pageUrl: "https://site.fr/page",
    evidenceUrl: "",
    evidenceText: "Titre peu précis",
    recommendation: "Préciser le service",
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.evidenceUrl).toBeNull();
});
it("accepts a prospect with no contact yet and returns validation errors for malformed URLs", () => {
  const input = {
    projectId: "project",
    sourceUrl: "https://publication.fr/article",
    targetUrl: "https://site.fr/page",
    reason: "Ressource pertinente",
    contactSourceUrl: "",
    contactEmail: "",
  };
  expect(saveProspectSchema.safeParse(input).success).toBe(true);
  expect(
    saveProspectSchema.safeParse({ ...input, sourceUrl: "not-a-url" }).success,
  ).toBe(false);
});
