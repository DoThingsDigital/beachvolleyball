import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Ticket 5.5: Dauerplatz-Übersicht der Saison (Raster + Liste + Kündigung).
// Inhalt hängt von vorherigen Käufen ab; der Test prüft die Struktur.

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

test("Übersicht rendert Saison-Auswahl, Raster oder Leerzustand", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/dauerplaetze");
  await expect(
    page.getByRole("heading", { name: /^Dauerplätze/ }),
  ).toBeVisible();
  // Saison-Umschalter zeigt die Winter-Saison
  await expect(
    page.getByRole("link", { name: /Winter 2026\/27/ }),
  ).toBeVisible();
  // Liste oder Leerzustand
  await expect(
    page
      .getByTestId("subscription-list")
      .or(page.getByText("Keine Dauerplätze.")),
  ).toBeVisible();
});
