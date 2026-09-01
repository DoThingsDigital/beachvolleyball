import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Tickets 5.6/5.7: Massenstorno-Vorschau + Bestätigungspflicht, Audit-Log.

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

test("Massenstorno: Vorschau zählt, Ausführen verlangt Bestätigung", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/massenstorno");
  await expect(
    page.getByRole("heading", { name: /^Massenstorno/ }),
  ).toBeVisible();

  const form = page.getByTestId("mass-cancel-form");
  // Zeitraum nach Saisonende: garantiert leer, unabhängig von Testkäufen
  await form.locator("input[name=dateFrom]").fill("2027-06-01");
  await form.locator("input[name=dateTo]").fill("2027-06-02");
  await form.getByRole("button", { name: "Vorschau" }).click();
  await expect(page.getByTestId("mass-cancel-preview")).toContainText(
    "0 Belegungen von 0 Kunden",
  );

  // Ausführen ohne Bestätigungs-Checkbox wird abgelehnt
  await form.locator("input[name=reason]").fill("E2E Testlauf");
  await form
    .getByRole("button", { name: "Massenstorno ausführen" })
    .click();
  await expect(
    form.getByText("Bitte die Ausführung bestätigen (Checkbox)."),
  ).toBeVisible();
});

test("Audit-Log rendert mit Filterleiste", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit-Log" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alle", exact: true })).toBeVisible();
  await expect(
    page.getByTestId("audit-list").or(page.getByText("Keine Einträge.")),
  ).toBeVisible();
});
