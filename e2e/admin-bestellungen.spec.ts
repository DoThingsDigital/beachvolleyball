import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

async function login(page: Page, target: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

// Nutzt die real existierende bezahlte Bestellung aus dem SEPA-Testkauf.
test("Bestellliste, Filter und Detailansicht", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page, "/admin/bestellungen?status=PAID");
  await expect(
    page.getByRole("heading", { name: "Bestellungen" }),
  ).toBeVisible();

  const firstOrderLink = page.locator("tbody a").first();
  await expect(firstOrderLink).toBeVisible();
  await firstOrderLink.click();

  await expect(page.getByTestId("admin-order-status")).toHaveText("Bezahlt");
  await expect(page.getByRole("heading", { name: "Zahlungen" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rechnungen & Gutschriften" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Erstatten" })).toBeEnabled();
});
