import { expect, test } from "@playwright/test";

// Vorverkaufs-UI (Ticket 2.2): Raster → Auswahl → Preisangebot.
// Läuft gegen den Seed (Winter 2026/27, PRESALE, Kontingent Feld 1+2 Mo–Do
// abends, Platzhalterpreise).

test("Raster, Auswahl und Preisangebot mit Terminanzahl", async ({ page }) => {
  await page.goto("/vorverkauf");
  await expect(
    page.getByRole("heading", { name: "Dauerplatz-Vorverkauf" }),
  ).toBeVisible();

  // Do 19:00 wählen (Kontingent blockt Feld 1+2 → trotzdem Plätze frei)
  await page.getByRole("link", { name: /^Do 19:00, \d+ Plätze frei$/ }).click();
  await expect(page.getByText("Do, 19:00 Uhr")).toBeVisible();

  // ersten freien Platz wählen
  await page
    .locator("section", { hasText: "Platz wählen" })
    .getByRole("link", { name: /^Feld \d/ })
    .first()
    .click();

  const quote = page.getByTestId("quote");
  await expect(quote).toBeVisible();
  await expect(page.getByTestId("quote-occurrences")).toHaveText(/\d+ Termine/);
  await expect(page.getByTestId("quote-total")).toHaveText(/\d+,\d{2}\s*€/);
  await expect(
    page.getByRole("button", { name: "Weiter zum Checkout" }),
  ).toBeDisabled();
});

test("Mobil (375 px): kein horizontales Scrollen (NF7)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "nur mobile");

  await page.goto("/vorverkauf");
  await expect(
    page.getByRole("heading", { name: "Dauerplatz-Vorverkauf" }),
  ).toBeVisible();

  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHScroll).toBe(true);
});
