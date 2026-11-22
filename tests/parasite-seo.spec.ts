import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("incomplete Vercel setup explains required configuration on desktop and mobile", async ({
  page,
}) => {
  const html = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `import { configurationResponse } from './src/server/vercel/configuration.ts';
     const response = configurationResponse(new Request('https://local.example/', { headers: { accept: 'text/html' } }));
     if (!response || response.status !== 503) throw new Error('Expected setup response');
     process.stdout.write(await response.text());`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        BETTER_AUTH_URL: undefined,
        BETTER_AUTH_SECRET: undefined,
        CRON_SECRET: undefined,
      },
    },
  );
  await page.setContent(html);
  await expect(
    page.getByRole("heading", {
      name: "Le déploiement est prêt. Connectons les services.",
    }),
  ).toBeVisible();
  await expect(page.getByText("À renseigner", { exact: true })).toHaveCount(4);
  await page.screenshot({
    path: "test-results/private/setup-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(html);
  await expect(page.getByRole("link", { name: "Ouvrir Vercel" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/private/setup-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("external publications persist drafts, validate publication URLs and render on mobile", async ({
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const seed = page.getByRole("button", { name: "Ajouter mes trois sites" });
  const site = page.getByRole("link", { name: "Agence Celexia", exact: true });
  await expect(seed.or(site).first()).toBeVisible();
  if (await seed.isVisible()) await seed.click();
  await expect(site).toBeVisible();
  const projectPath = await site.getAttribute("href");
  expect(projectPath).toMatch(/^\/p\//);
  await page.goto(`${projectPath}/parasite-seo`);
  await expect(
    page.getByRole("heading", { name: "Parasite SEO", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Préparer cette méthode", exact: true }),
  ).toHaveCount(7);
  await page
    .getByLabel("Mot-clé ou sujet", { exact: true })
    .fill("communication locale");
  await page.getByLabel("Secteur ou métier", { exact: true }).fill("artisanat");
  await page.getByLabel("Ville ou zone", { exact: true }).fill("Lyon");
  await page.screenshot({
    path: "test-results/private/parasite-seo-methods-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("article", {
      name: "Republier un guide sur Medium",
      exact: true,
    })
    .getByRole("button", { name: "Préparer cette méthode", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel("Nom du support", { exact: true }),
  ).toHaveValue("Medium");
  await expect(
    dialog.getByLabel("Mot-clé ou sujet ciblé", { exact: true }),
  ).toHaveValue("communication locale");
  const title = `[Validation] Publication externe ${Date.now()}`;
  const editedTitle = `${title} — revue`;
  await dialog
    .getByLabel("Titre de la publication", { exact: true })
    .fill(title);
  await dialog
    .getByLabel("Page de votre site à mettre en avant", { exact: true })
    .fill("https://agencecelexia.fr/guide-validation");
  await dialog
    .getByLabel("Brief et brouillon", { exact: true })
    .fill(
      "[Validation] Guide fondé sur une expérience métier réelle, à adapter aux lecteurs du support.",
    );
  await dialog
    .getByRole("button", { name: "Enregistrer la publication", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Mes publications/ }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Modifier ${title}`, exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Statut", exact: true }).click();
  await page.getByRole("option", { name: "Publiée", exact: true }).click();
  const submit = dialog.getByRole("button", {
    name: "Enregistrer la publication",
    exact: true,
  });
  if (await submit.isEnabled()) await submit.click();
  await expect(
    dialog.getByText(
      "Indiquez l’URL publiée avant de marquer cette publication comme publiée.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("URL de la publication", { exact: true })
    .fill("https://example.org/publication-validation");
  await dialog
    .getByLabel("Titre de la publication", { exact: true })
    .fill(editedTitle);
  await dialog
    .getByRole("combobox", { name: "Qualification du lien", exact: true })
    .click();
  await page.getByRole("option", { name: "Nofollow", exact: true }).click();
  await submit.click();
  await expect(dialog).toBeHidden();
  const published = page.getByRole("article", {
    name: editedTitle,
    exact: true,
  });
  await expect(published.getByText("Publiée", { exact: true })).toBeVisible();
  await expect(
    published.getByText(/Lien : Nofollow \(déclaré\)/),
  ).toBeVisible();
  await expect(
    published.getByRole("link", { name: /Ouvrir la publication/ }),
  ).toHaveAttribute("href", "https://example.org/publication-validation");
  await page.reload();
  await page.getByRole("tab", { name: /Mes publications/ }).click();
  await expect(published.getByText(/Publication déclarée le/)).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Mes publications/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.screenshot({
    path: "test-results/private/parasite-seo-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByLabel("Mot-clé ou sujet", { exact: true })
    .fill("communication locale");
  await page.getByLabel("Secteur ou métier", { exact: true }).fill("artisanat");
  await page.getByLabel("Ville ou zone", { exact: true }).fill("Lyon");
  await page.screenshot({
    path: "test-results/private/parasite-seo-methods-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: /Mes publications/ }).click();
  await expect(
    page.getByRole("heading", { name: editedTitle, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/private/parasite-seo-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await published
    .getByRole("button", { name: `Modifier ${editedTitle}`, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/private/parasite-seo-mobile-detail.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
