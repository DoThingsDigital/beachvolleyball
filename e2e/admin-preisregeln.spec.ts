import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

async function login(page: Page, target: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

test("Preisvorschau: Peak-Slot am Montagabend", async ({ page }) => {
  await login(page, "/admin/konfiguration/preisregeln");
  await expect(
    page.getByRole("heading", { name: /Preisregeln –/ }),
  ).toBeVisible({ timeout: 30_000 });

  // Mo 02.11.2026, 19:00, 60 min → Peak-Regel aus dem Seed (34 €/h Platzhalter)
  await page.locator("#preview-date").fill("2026-11-02");
  await page.locator("#preview-start").fill("19:00");
  await page.locator("#preview-duration").fill("60");
  await page.getByRole("button", { name: "Preis berechnen" }).click();

  await expect(page.getByTestId("preview-price")).toHaveText("34,00 €");
});

test("Preisvorschau: außerhalb aller Regeln → verständliche Meldung", async ({
  page,
}) => {
  await login(page, "/admin/konfiguration/preisregeln");
  await expect(
    page.getByRole("heading", { name: /Preisregeln –/ }),
  ).toBeVisible({ timeout: 30_000 });

  await page.locator("#preview-date").fill("2026-11-02");
  await page.locator("#preview-start").fill("22:30");
  await page.locator("#preview-duration").fill("60");
  await page.getByRole("button", { name: "Preis berechnen" }).click();

  await expect(
    page.getByText("Für diesen Slot greift keine Preisregel."),
  ).toBeVisible();
});
