import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Tickets 6.1–6.4: Reports-Seite mit Kennzahlen und CSV/PDF-Downloads.

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

test("Reports rendern, CSV- und PDF-Download liefern Dateien", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  // Saisonmonat mit Kontingent-Belegungen
  await page.goto("/admin/reports?von=2026-11-01&bis=2026-11-30");
  await expect(page.getByRole("heading", { name: /^Reports/ })).toBeVisible();
  await expect(page.getByTestId("report-vereinsnutzung")).toBeVisible();
  await expect(page.getByTestId("report-auslastung")).toBeVisible();
  await expect(page.getByTestId("report-umsatz")).toBeVisible();
  await expect(page.getByTestId("report-dauerplatz")).toBeVisible();

  // Kontingent (Mo–Do 18–22, 2 Plätze) ergibt eine Vorhaltungsquote > 0
  await expect(
    page.getByTestId("report-vereinsnutzung").getByText(/%/).first(),
  ).toBeVisible();

  const venueParam = new URL(
    (await page
      .getByTestId("report-vereinsnutzung")
      .getByRole("link", { name: "CSV ↓" })
      .getAttribute("href"))!,
    "http://localhost:3000",
  ).searchParams.get("venue");
  expect(venueParam).toBeTruthy();

  // Downloads über die Session des Browsers
  const base = `/admin/reports/download?venue=${venueParam}&von=2026-11-01&bis=2026-11-30`;
  const csv = await page.request.get(`${base}&report=vereinsnutzung`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Vereinsnutzungs-Report");

  const pdf = await page.request.get(
    `${base}&report=vereinsnutzung&format=pdf`,
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  const auslastung = await page.request.get(
    `${base}&report=auslastung&gruppierung=court`,
  );
  expect(auslastung.status()).toBe(200);
  expect(await auslastung.text()).toContain("Auslastungs-Report");

  const umsatz = await page.request.get(`${base}&report=umsatz`);
  expect(umsatz.status()).toBe(200);
  expect(await umsatz.text()).toContain("Umsatz-Report");
});
