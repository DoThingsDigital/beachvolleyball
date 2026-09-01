import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? "";
const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "";

// Ticket 4.6: Mitgliedschaftsanfrage im Konto, Freigabe in der
// Vereinsverwaltung. Der Seed macht den Admin zum Vereins-Admin.

// Idempotenz: die Mitgliedschaft des Testkunden vor dem Lauf entfernen,
// damit der Anfrage-Button wieder erscheint.
test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (customerEmail) {
      await pool.query(
        `DELETE FROM "ClubMembership" cm USING "User" u
         WHERE cm."userId" = u.id AND u.email = $1`,
        [customerEmail],
      );
    }
    // Für den Kontingent-Test (Vereinsbetrieb-Modus) eigene Daten anlegen:
    // das Seed-Kontingent ist seit E-005 ein Mitglieder-Buchungsfenster
    // ohne materialisierte Termine. Idempotent über feste IDs.
    const meta = await pool.query(
      `SELECT v.id AS venue_id, v."organisationId" AS org_id,
              c.id AS club_id, co.id AS court_id, u.id AS admin_id
       FROM "Venue" v
       JOIN "Club" c ON c."venueId" = v.id
       JOIN "Court" co ON co."venueId" = v.id AND co.name = 'Feld 4'
       JOIN "User" u ON u.email = $1
       WHERE v.slug = 'picco-beach' LIMIT 1`,
      [adminEmail],
    );
    const row = meta.rows[0];
    if (row) {
      await pool.query(
        `INSERT INTO "Block" (id, "organisationId", "venueId", "courtId", "clubId", type, title, "startAt", "endAt", rrule, "memberSelfBooking", "createdByUserId", "createdAt", "updatedAt")
         VALUES ('e2e-betrieb-block', $1, $2, $3, $4, 'VEREIN', 'E2E-Vereinsbetrieb',
                 now() + interval '7 days', now() + interval '7 days 2 hours', NULL, false, $5, now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [row.org_id, row.venue_id, row.court_id, row.club_id, row.admin_id],
      );
      // Termine des Betriebs-Blocks frisch aufsetzen (Test ist destruktiv)
      await pool.query(
        `DELETE FROM "Booking" WHERE id IN ('e2e-betrieb-b1','e2e-betrieb-b2')`,
      );
      // 03:00–04:00 UTC liegt vor der Öffnung – kollidiert nie mit
      // regulären Buchungen anderer Specs (Exclusion-Constraint)
      await pool.query(
        `INSERT INTO "Booking" (id, "organisationId", "venueId", "courtId", "blockId", "clubId", "startAt", "endAt", kind, status, "usageType", source, "confirmedAt", "createdAt", "updatedAt")
         VALUES
           ('e2e-betrieb-b1', $1, $2, $3, 'e2e-betrieb-block', $4, date_trunc('day', now()) + interval '10 days 3 hours', date_trunc('day', now()) + interval '10 days 4 hours', 'BLOCK', 'CONFIRMED', 'VEREIN', 'BLOCK', now(), now(), now()),
           ('e2e-betrieb-b2', $1, $2, $3, 'e2e-betrieb-block', $4, date_trunc('day', now()) + interval '11 days 3 hours', date_trunc('day', now()) + interval '11 days 4 hours', 'BLOCK', 'CONFIRMED', 'VEREIN', 'BLOCK', now(), now(), now())`,
        [row.org_id, row.venue_id, row.court_id, row.club_id],
      );
    }
  } finally {
    await pool.end();
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(email);
}

async function logout(page: Page) {
  await page.goto("/konto");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/(login)?$/);
}

test("Vereins-Admin sieht Verwaltung mit Mitgliederliste und Import", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page, adminEmail, adminPassword);
  await page.goto("/verein");
  await expect(
    page.getByRole("heading", { name: "Vereinsverwaltung" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Beachclub-Köln e.V." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importieren" }),
  ).toBeVisible();
});

test("Kontingent: bestätigen, beschriften, freigeben (5.3)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page, adminEmail, adminPassword);
  await page.goto("/verein");
  const list = page.getByTestId("quota-list").first();
  await expect(list).toBeVisible();

  // Ersten unbestätigten Termin bestätigen (Zeile über ihren Termin-Text
  // ankern – nach revalidatePath wechseln Live-Locators sonst die Zeile)
  const first = list.locator("li", { hasText: "Unbestätigt" }).first();
  // Termin + Platz zusammen sind eindeutig (zwei Plätze teilen die Zeit)
  const firstWhen = await first.locator("p").first().innerText();
  await first.getByRole("button", { name: "Bestätigen" }).click();
  const firstRow = list.locator("li", { hasText: firstWhen });
  await expect(firstRow.getByText("Bestätigt", { exact: true })).toBeVisible();

  // Nächsten unbestätigten Termin beschriften und freigeben
  const second = list.locator("li", { hasText: "Unbestätigt" }).first();
  const secondWhen = await second.locator("p").first().innerText();
  await second.locator("input[name=label]").fill("U18 Training");
  await second.getByRole("button", { name: "Beschriften" }).click();
  const secondRow = list.locator("li", { hasText: secondWhen });
  await expect(secondRow.getByText("Beschriftung gespeichert.")).toBeVisible();
  await secondRow.getByRole("button", { name: "Freigeben" }).click();
  await expect(
    secondRow.getByText("Freigegeben", { exact: true }),
  ).toBeVisible();
});

test("Anfrage im Konto → Freigabe im Verein → Status aktiv", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");
  test.skip(!customerEmail || !customerPassword, "SEED_CUSTOMER_* nicht gesetzt");

  // Kunde stellt die Anfrage
  await login(page, customerEmail, customerPassword);
  await page.goto("/konto");
  await expect(page.getByText("Vereinsmitgliedschaft")).toBeVisible();
  await page.getByRole("button", { name: "Mitgliedschaft anfragen" }).click();
  // Nach revalidatePath zeigt die Karte den PENDING-Status
  await expect(page.getByText("Angefragt – wartet auf Freigabe")).toBeVisible();
  await logout(page);

  // Vereins-Admin gibt frei
  await login(page, adminEmail, adminPassword);
  await page.goto("/verein");
  const request = page
    .getByTestId("pending-requests")
    .locator("li", { hasText: customerEmail });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Freigeben" }).click();
  await expect(
    page.getByTestId("member-list").locator("li", { hasText: customerEmail }),
  ).toBeVisible();
  await logout(page);

  // Kunde sieht die aktive Mitgliedschaft
  await login(page, customerEmail, customerPassword);
  await page.goto("/konto");
  await expect(
    page.getByText("Aktives Mitglied – Mitgliederpreise aktiv"),
  ).toBeVisible();
});
