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

test("Admin-Bereich für Admin-Rolle erreichbar, Layout sichtbar", async ({
  page,
}) => {
  await page.goto("/login?callbackUrl=/admin");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByTestId("admin-venue")).toHaveText("Picco Beach");
  await expect(
    page.getByRole("navigation", { name: "Admin-Navigation" }),
  ).toBeVisible();
});

test("Kunde ohne Staff-Rolle wird vom Admin auf /konto umgeleitet", async ({
  page,
}) => {
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL;
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
  test.skip(!customerEmail || !customerPassword, "SEED_CUSTOMER_* nicht gesetzt");

  await page.goto("/login");
  await page.locator("#login-email").fill(customerEmail!);
  await page.locator("#login-password").fill(customerPassword!);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/konto/);

  // Direkter Aufruf des Admin-Bereichs → Middleware leitet per 307 um,
  // Admin-Inhalte bleiben unsichtbar.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/konto/);
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});
