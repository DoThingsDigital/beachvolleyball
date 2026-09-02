import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Ticket 5.1: Sperren-Verwaltung — anlegen, Materialisierung sichtbar im
// öffentlichen Kalender, beenden. Reste früherer Läufe räumt global-setup ab
// (ein beforeAll hier liefe je Worker und würde parallel angelegte Blöcke
// anderer Tests wegräumen).

const E2E_TITLE = "E2E-Wartung";
const E2E_RANGE_TITLE = "E2E-Zeitraum";
// Mi 18.11.2026 liegt in der Winter-Saison
const E2E_DATE = "2026-11-18";
// Fr 20. – Sa 21.11.2026: ganztägiger Zeitraum für den Mehrplatz-Test
const E2E_RANGE_FROM = "2026-11-20";
const E2E_RANGE_TO = "2026-11-21";

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

  // Einmalige Wartung auf Feld 3 anlegen (Platzwahl über das Mehrfach-Dropdown)
  const form = page.locator("section", { hasText: "Neue Sperre" });
  await form.getByRole("button", { name: "Plätze" }).click();
  await form.getByRole("checkbox", { name: "Feld 3" }).check();
  await page.keyboard.press("Escape");
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

test("Zeitraum-Sperre: zwei Plätze, ganze Tage von–bis", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/sperren");
  const form = page.locator("section", { hasText: "Neue Sperre" });

  // Feld 3 + Feld 4 im Dropdown anhaken
  const courtTrigger = form.getByRole("button", { name: "Plätze" });
  await courtTrigger.click();
  await form.getByRole("checkbox", { name: "Feld 3" }).check();
  await form.getByRole("checkbox", { name: "Feld 4" }).check();
  await page.keyboard.press("Escape");
  await expect(courtTrigger).toContainText("Feld 3, Feld 4");

  await form.locator("select[name=type]").selectOption("GESPERRT");
  await form.locator("input[name=title]").fill(E2E_RANGE_TITLE);
  await form.locator("input[name=date]").fill(E2E_RANGE_FROM);
  await form.locator("input[name=dateTo]").fill(E2E_RANGE_TO);
  // Zeitraum gewählt → Uhrzeiten-Felder verschwinden (ganztägig)
  await expect(form.locator("input[name=timeFrom]")).toHaveCount(0);
  await form.getByRole("button", { name: "Anlegen" }).click();
  await expect(form.getByText(/2 Sperren angelegt/)).toBeVisible();

  // Beide Sperren stehen mit Zeitraum in der Liste
  const rows = page
    .getByTestId("block-list")
    .locator("li", { hasText: E2E_RANGE_TITLE });
  await expect(rows).toHaveCount(2);
  await expect(
    rows.first().getByText(`${E2E_RANGE_FROM} – ${E2E_RANGE_TO} (ganztägig)`),
  ).toBeVisible();

  // Kalender zeigt beide Tage als gesperrt (erster Slot des Tages)
  await page.goto(`/kalender?tag=${E2E_RANGE_FROM}`);
  await expect(page.getByLabel(/gesperrt/).first()).toBeVisible();
  await page.goto(`/kalender?tag=${E2E_RANGE_TO}`);
  await expect(page.getByLabel(/gesperrt/).first()).toBeVisible();
});
