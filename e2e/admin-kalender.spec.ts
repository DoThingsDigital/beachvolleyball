import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Ticket 5.4: Admin-Kalender — manuelle Belegung anlegen, Aktionen (Storno).
// Fester Slot weit in der Saison (Mi 25.11.2026, 08:00, Feld 4): kollidiert
// mit keinem anderen Spec; der Test storniert am Ende wieder (wiederholbar).

const DATE = "2026-11-25";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

test("Manuelle Belegung anlegen, Panel öffnen, stornieren", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto(`/admin/kalender?tag=${DATE}`);
  await expect(page.getByRole("heading", { name: /^Kalender/ })).toBeVisible();

  // Freie Zelle öffnen → Formular
  await page
    .getByLabel("Feld 4 08:00 frei – Belegung anlegen", { exact: true })
    .click();
  const form = page.getByTestId("manual-booking-form");
  await expect(form).toBeVisible();
  await form.locator("input[name=label]").fill("E2E-Intern");
  await form.getByRole("button", { name: "Belegung anlegen" }).click();
  await expect(form.getByText("Belegung angelegt.")).toBeVisible();

  // Zelle zeigt die Belegung, Panel öffnet mit Aktionen
  const cell = page.getByLabel("Feld 4 08:00: E2E-Intern", { exact: true });
  await expect(cell).toBeVisible();
  await cell.click();
  const panel = page.getByTestId("booking-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("CONFIRMED")).toBeVisible();

  // Stornieren → Belegung verschwindet aus der Anzeige, Slot wieder frei
  // (nach revalidatePath verschwindet das Panel mitsamt Meldung)
  await panel.getByRole("button", { name: "Stornieren" }).click();
  await expect(
    page.getByLabel("Feld 4 08:00: E2E-Intern", { exact: true }),
  ).toHaveCount(0);
  await page.goto(`/admin/kalender?tag=${DATE}`);
  await expect(
    page.getByLabel("Feld 4 08:00 frei – Belegung anlegen", { exact: true }),
  ).toBeVisible();
});

test("Wochenansicht je Platz rendert mit Mitglieder-Fenster", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto(`/admin/kalender?tag=${DATE}`);
  await page.getByRole("link", { name: "Feld 1", exact: true }).click();
  await expect(page.getByText(/Feld 1 · Woche ab/)).toBeVisible();
  // Das Kontingent ist seit E-005 ein Mitglieder-Buchungsfenster: die
  // Abendzellen (Mo–Do 18–22) sind frei, aber als Vereinszeit markiert
  await expect(
    page.getByLabel(/18:00 frei – Belegung anlegen \(Mitglieder-Fenster\)/).first(),
  ).toBeVisible();
});
