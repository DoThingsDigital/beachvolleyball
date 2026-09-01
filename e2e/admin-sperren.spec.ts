import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Ticket 5.1: Sperren-Verwaltung — anlegen, Materialisierung sichtbar im
// öffentlichen Kalender, beenden.

const E2E_TITLE = "E2E-Wartung";
// Mi 18.11.2026 liegt in der Winter-Saison
const E2E_DATE = "2026-11-18";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Test-Hygiene (nur Dev-DB): frühere E2E-Sperren samt Belegungen entfernen
    await pool.query(
      `DELETE FROM "Booking" WHERE "blockId" IN (SELECT id FROM "Block" WHERE title = $1)`,
      [E2E_TITLE],
    );
    await pool.query(`DELETE FROM "Block" WHERE title = $1`, [E2E_TITLE]);
  } finally {
    await pool.end();
  }
});

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

test("Sperre anlegen → Kalender zeigt gesperrt → beenden", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/sperren");
  await expect(
    page.getByRole("heading", { name: /^Sperren/ }),
  ).toBeVisible();
  // Seed-Kontingent ist gelistet
  await expect(
    page.getByText("Vereinskontingent Feld 1", { exact: false }).first(),
  ).toBeVisible();

  // Einmalige Wartung auf Feld 3 anlegen
  const form = page.locator("section", { hasText: "Neue Sperre" });
  await form.locator("select[name=courtId]").selectOption({ label: "Feld 3" });
  await form.locator("select[name=type]").selectOption("WARTUNG");
  await form.locator("input[name=title]").fill(E2E_TITLE);
  await form.locator("input[name=date]").fill(E2E_DATE);
  await form.locator("input[name=timeFrom]").fill("08:00");
  await form.locator("input[name=timeTo]").fill("10:00");
  await form.getByRole("button", { name: "Anlegen" }).click();
  await expect(form.getByText(/Gespeichert – .*Termine aktiv/)).toBeVisible();

  // Materialisierung ist im öffentlichen Kalender sichtbar
  await page.goto(`/kalender?tag=${E2E_DATE}`);
  await expect(page.getByLabel(/08:00 gesperrt/).first()).toBeVisible();

  // Beenden storniert zukünftige Termine
  await page.goto("/admin/sperren");
  const row = page
    .getByTestId("block-list")
    .locator("li", { hasText: E2E_TITLE });
  await row.getByRole("button", { name: "Beenden" }).click();
  await expect(row.getByText(/Sperre beendet/)).toBeVisible();

  await page.goto(`/kalender?tag=${E2E_DATE}`);
  await expect(page.getByLabel(/08:00 gesperrt/)).toHaveCount(0);
});
