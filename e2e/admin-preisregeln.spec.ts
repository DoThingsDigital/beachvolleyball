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

// Mehrplatz-Regel: Formular mit Platz-Checkboxen anlegen (Feld 1+2), dann per
// Vorschau prüfen, dass sie auf Feld 1 greift (inkl. Mitgliederpreis) und auf
// Feld 3 nicht. Mo 06:00–07:00 liegt außerhalb aller Seed-Regeln; Cleanup
// macht global-setup (Label E2E-Zweifelder-Regel).
test("Preisregel für zwei Plätze anlegen und per Vorschau prüfen", async ({
  page,
}) => {
  await login(page, "/admin/konfiguration/preisregeln");
  await expect(
    page.getByRole("heading", { name: /Preisregeln –/ }),
  ).toBeVisible({ timeout: 30_000 });

  const createSection = page
    .locator("section")
    .filter({ hasText: "Neue Preisregel anlegen" });
  await createSection.locator("#label-neu").fill("E2E-Zweifelder-Regel");
  await createSection.locator("#weekdays-neu").fill("1");
  await createSection.locator("#timeFrom-neu").fill("06:00");
  await createSection.locator("#timeTo-neu").fill("07:00");
  await createSection.locator("#pricePerHourCents-neu").fill("9900");
  await createSection.locator("#memberPricePerHourCents-neu").fill("8800");
  await createSection.locator("#priority-neu").fill("50");
  const courtGroup = createSection.getByRole("group", {
    name: /Gilt für Plätze/,
  });
  await courtGroup.getByRole("checkbox", { name: "Feld 1" }).check();
  await courtGroup.getByRole("checkbox", { name: "Feld 2" }).check();
  await createSection.getByRole("button", { name: "Anlegen" }).click();
  await expect(createSection.getByRole("status")).toHaveText("Gespeichert.");

  // Vorschau Feld 1, Mo 02.11.2026 06:00 → neue Regel greift
  await page.locator("#preview-court").selectOption({ label: "Feld 1" });
  await page.locator("#preview-date").fill("2026-11-02");
  await page.locator("#preview-start").fill("06:00");
  await page.locator("#preview-duration").fill("60");
  await page.getByRole("button", { name: "Preis berechnen" }).click();
  await expect(page.getByTestId("preview-price")).toHaveText("99,00 €");

  // Mitgliederpreis aus derselben Regel
  await page.locator("#preview-member").check();
  await page.getByRole("button", { name: "Preis berechnen" }).click();
  await expect(page.getByTestId("preview-price")).toHaveText("88,00 €");

  // Feld 3 gehört nicht zur Regel → dort greift um 06:00 keine Regel
  await page.locator("#preview-member").uncheck();
  await page.locator("#preview-court").selectOption({ label: "Feld 3" });
  await page.getByRole("button", { name: "Preis berechnen" }).click();
  await expect(
    page.getByText("Für diesen Slot greift keine Preisregel."),
  ).toBeVisible();
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
