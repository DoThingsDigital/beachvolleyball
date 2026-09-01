import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

async function login(page: Page, target: string) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

test("Platz anlegen und deaktivieren", async ({ page }) => {
  await login(page, "/admin/konfiguration/plaetze");
  await expect(
    page.getByRole("heading", { name: /Plätze –/ }),
  ).toBeVisible({ timeout: 30_000 });

  const name = `E2E-Feld ${Date.now()}`;
  const createForm = page.locator("section", {
    hasText: "Neuen Platz anlegen",
  });
  await createForm.getByLabel("Name").fill(name);
  await createForm.getByRole("button", { name: "Anlegen" }).click();
  await expect(createForm.getByRole("status")).toHaveText("Gespeichert.");

  await page.reload();
  // Name steht im Input-value, nicht im Textinhalt
  const row = page
    .locator("li")
    .filter({ has: page.locator(`input[value="${name}"]`) });
  await expect(row).toBeVisible();

  // Soft-Delete: deaktivieren statt löschen
  await row.getByLabel("Aktiv").uncheck();
  await row.getByRole("button", { name: "Speichern" }).click();
  await expect(row.getByRole("status")).toHaveText("Gespeichert.");
});

test("Aussteller-Wechsel am Standort (B4)", async ({ page }) => {
  await login(page, "/admin/konfiguration/aussteller");
  await expect(
    page.getByRole("heading", { name: "Rechnungsaussteller" }),
  ).toBeVisible({ timeout: 30_000 });

  const active = page.getByTestId("active-legal-entity");
  await expect(active).toHaveText("DoThingsDigital GmbH");

  // Plan-B-Aussteller aktivieren, zuweisen, dann zurückwechseln
  const bc = page.locator("li", { hasText: "Beachclub-Köln e.V." });
  const bcActive = bc.getByLabel("Aktiv");
  if (!(await bcActive.isChecked())) {
    await bcActive.check();
    await bc.getByRole("button", { name: "Speichern" }).click();
    await expect(bc.getByRole("status")).toHaveText("Gespeichert.");
    await page.reload();
  }

  const switcher = page.getByLabel(/Aussteller wechseln/);
  await switcher.selectOption({ label: "Beachclub-Köln e.V." });
  await page.getByRole("button", { name: "Zuweisen" }).click();
  await expect(page.getByTestId("active-legal-entity")).toHaveText(
    "Beachclub-Köln e.V.",
  );

  // Zurück auf Plan A, damit der Seed-Zustand erhalten bleibt
  await page.getByLabel(/Aussteller wechseln/).selectOption({
    label: "DoThingsDigital GmbH",
  });
  await page.getByRole("button", { name: "Zuweisen" }).click();
  await expect(page.getByTestId("active-legal-entity")).toHaveText(
    "DoThingsDigital GmbH",
  );
});
