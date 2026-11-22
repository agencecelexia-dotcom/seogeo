import { expect, test } from "@playwright/test";

test("private cockpit, persisted evidence and budget without paid credentials", async ({
  page,
}) => {
  if (process.env.PRIVATE_E2E_EMAIL && process.env.PRIVATE_E2E_PASSWORD) {
    await page.goto("/sign-in");
    await page
      .getByLabel("Email address", { exact: true })
      .fill(process.env.PRIVATE_E2E_EMAIL);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.PRIVATE_E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
  }
  const fixture = `validation-v1-${Date.now()}`;
  const pageUrl = `https://agencecelexia.fr/${fixture}`;
  const sourceUrl = `https://example.org/${fixture}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vos sites, vos prochaines actions" }),
  ).toBeVisible();
  const seed = page.getByRole("button", { name: "Ajouter mes trois sites" });
  const site = page.getByRole("link", { name: "Agence Celexia", exact: true });
  await expect(seed.or(site).first()).toBeVisible();
  if (await seed.isVisible()) await seed.click();
  await expect(site).toBeVisible();
  const href = await site.getAttribute("href");
  expect(href).toMatch(/^\/p\//);
  await page.screenshot({
    path: "test-results/private/cockpit-desktop.png",
    fullPage: true,
  });

  await page.goto(`${href}/actions`);
  await page
    .getByRole("button", { name: "Nouvelle action", exact: true })
    .click();
  await page
    .getByLabel("Action à entreprendre")
    .fill("[Validation V1] Corriger le titre");
  await page.getByLabel("Page concernée").fill(pageUrl);
  await page
    .getByLabel("Constat et preuve")
    .fill("Observation locale de validation : le titre manque de précision.");
  await page
    .getByLabel("Correction proposée")
    .fill("Préciser le service et la ville dans le titre.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page
      .getByText("[Validation V1] Corriger le titre", { exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByText("[Validation V1] Corriger le titre", { exact: true })
      .first(),
  ).toBeVisible();

  await page.goto(`${href}/imports`);
  await page.getByLabel("Début de période").fill("2026-11-01");
  await page.getByLabel("Fin de période").fill("2026-11-21");
  await page
    .getByPlaceholder("Coller le contenu ou choisir un fichier…")
    .fill(`Pages,Impressions\n${pageUrl},42\n`);
  await page
    .getByRole("button", { name: "Prévisualiser", exact: true })
    .click();
  await expect(
    page.getByText("1 lignes valides", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmer l’import", exact: true })
    .click();
  await expect(
    page.getByText("1 observations enregistrées.", { exact: true }),
  ).toBeVisible();

  await page.goto(`${href}/pages`);
  await page
    .getByRole("button", {
      name: pageUrl,
      exact: true,
    })
    .click();
  await expect(page.getByText(/42 impressions/)).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Non mesuré", exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/private/page-dossier.png",
    fullPage: true,
  });

  await page.goto(`${href}/prospects`);
  await page
    .getByRole("button", { name: "Ajouter un prospect", exact: true })
    .click();
  await page.getByLabel("Page source", { exact: true }).fill(sourceUrl);
  await page.getByLabel("Page de ton site à proposer").fill(pageUrl);
  await page
    .getByLabel("Pourquoi cette opportunité est pertinente")
    .fill(
      "[Validation V1] Ressource liée à notre sujet, à examiner avant qualification.",
    );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByText("example.org", { exact: false }).first(),
  ).toBeVisible();

  await page.goto("/monitoring");
  await expect(
    page.getByRole("heading", { name: "Collecte et budget", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Plafond données (€ / mois)").fill("15");
  await page.getByLabel("Plafond IA (€ / mois)").fill("5");
  await page.getByRole("button", { name: "Enregistrer le budget" }).click();
  await expect(
    page.getByText("Budget enregistré", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collecter maintenant" })
    .first()
    .click();
  await expect(
    page.getByRole("cell", { name: "Non connecté", exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/private/monitoring-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vos sites, vos prochaines actions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Agence Celexia", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/private/cockpit-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
