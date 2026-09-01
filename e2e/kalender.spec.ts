import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Einzelbuchung braucht eine Saison, die "heute" abdeckt – die Winter-Saison
// beginnt erst am 01.10. Der Test legt deshalb eine eigene aktive Testsaison
// mit niedriger Preisregel-Priorität an (idempotent, Winterdaten unberührt).
test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const venueRes = await pool.query(
      `SELECT id, "organisationId" FROM "Venue" WHERE slug = 'picco-beach'`,
    );
    const venue = venueRes.rows[0];
    if (!venue) return;

    // Alt-Reste mit Zufalls-IDs aus früheren Läufen entfernen (nur diese –
    // die fixed-Zeilen bleiben unangetastet)
    await pool.query(
      `DELETE FROM "PriceRule" WHERE label = 'E2E-Testsaison-Regel' AND id <> 'e2e-rule-fixed'`,
    );
    await pool.query(
      `DELETE FROM "Season" WHERE name = 'E2E-Testsaison' AND id <> 'e2e-season-fixed'`,
    );

    // Lückenloses Upsert mit festen IDs: beforeAll läuft bei fullyParallel
    // je Worker – ein DELETE+INSERT würde parallelen Tests kurzzeitig die
    // Preisregel entziehen (NO_PRICE_RULE-Race zwischen Vorschau und Kauf).
    await pool.query(
      `INSERT INTO "Season" (id, "organisationId", "venueId", name, "startDate", "endDate", status, "subscriptionDiscountBp", "createdAt", "updatedAt")
       VALUES ('e2e-season-fixed', $1, $2, 'E2E-Testsaison',
               now() - interval '1 day', now() + interval '30 days', 'ACTIVE', 0, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         "startDate" = now() - interval '1 day',
         "endDate" = now() + interval '30 days',
         status = 'ACTIVE',
         "updatedAt" = now()`,
      [venue.organisationId, venue.id],
    );
    await pool.query(
      `INSERT INTO "PriceRule" (id, "organisationId", "venueId", "seasonId", "courtIds", weekdays, "timeFrom", "timeTo", "pricePerHourCents", priority, label, active, "createdAt", "updatedAt")
       VALUES ('e2e-rule-fixed', $1, $2, 'e2e-season-fixed', '{}', '{1,2,3,4,5,6,7}', '08:00', '22:00', 2000, 1, 'E2E-Testsaison-Regel', true, now(), now())
       ON CONFLICT (id) DO UPDATE SET active = true, "updatedAt" = now()`,
      [venue.organisationId, venue.id],
    );
  } finally {
    await pool.end();
  }
});

// Ticket 4.2/4.3: öffentlicher Kalender mit Zuständen, Preisvorschau,
// Einzelbuchung mit Hold; mobil ohne horizontales Scrollen.

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(adminEmail);
}

// Morgen ist immer innerhalb des Horizonts (14 Tage) und außerhalb des
// Vorlaufs (60 min); Datum lokal berechnet.
function tomorrow(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test("Kalender zeigt Zustände und Preisvorschau, Buchung erzeugt Hold", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto(`/kalender?tag=${tomorrow()}`);
  await expect(
    page.getByRole("heading", { name: "Belegungskalender" }),
  ).toBeVisible();

  // freien Vormittagsslot wählen (10:00 kollidiert nie mit dem Kontingent)
  const freeSlot = page.getByRole("link", { name: /10:00 frei$/ }).first();
  await expect(freeSlot).toBeVisible();
  await freeSlot.click();

  await expect(page.getByTestId("booking-quote")).toBeVisible();
  await expect(page.getByTestId("booking-price")).toHaveText(/\d+,\d{2}\s*€/);

  await page.locator("#booking-terms").check();
  await page.getByTestId("book-now").click();

  await expect(page).toHaveURL(/\/bestellung\//);
  await expect(page.getByTestId("order-status")).toHaveText("Warten auf Zahlung");
});

test("Vereinskontingent ist im Kalender sichtbar (Mo abends)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  // Montag innerhalb der Saison (Kontingent-Serie startet 01.10.2026);
  // die Zustandsanzeige hängt nicht am Buchungshorizont
  await page.goto("/kalender?tag=2026-10-05");
  const vereinCells = page.getByLabel(/19:00 Vereinskontingent/);
  await expect(vereinCells.first()).toBeVisible();
});

test("Mobil (375 px): Kalender ohne horizontales Scrollen (NF7)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "nur mobile");

  await page.goto(`/kalender?tag=${tomorrow()}`);
  await expect(
    page.getByRole("heading", { name: "Belegungskalender" }),
  ).toBeVisible();
  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHScroll).toBe(true);
});
