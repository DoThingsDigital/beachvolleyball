import { expect, test } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

test.beforeAll(() => {
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD fehlen – .env prüfen (siehe .env.example).",
    );
  }
});

test("Login mit Passwort, Konto sichtbar, Logout", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page).toHaveURL(/\/konto/);
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("Falsches Passwort zeigt Fehlermeldung", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill("definitiv-falsch");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("Geschützte Route leitet ohne Session zum Login", async ({ page }) => {
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fkonto/);
});

test("Admin-Bereich für Admin-Rolle erreichbar", async ({ page }) => {
  await page.goto("/login?callbackUrl=/admin");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page).toHaveURL(/\/admin/);
  await expect(
    page.getByRole("heading", { name: "Backoffice" }),
  ).toBeVisible();
});
