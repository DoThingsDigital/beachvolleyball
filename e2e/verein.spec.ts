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
    // Kontingent-Drift zurücksetzen: in früheren Läufen freigegebene/
    // bestätigte Seed-Termine wieder auf unbestätigt CONFIRMED stellen
    // (nur wo kein anderer aktiver Belegungssatz den Slot besetzt).
    await pool.query(
      `UPDATE "Booking" b SET status = 'CONFIRMED', "clubConfirmedAt" = NULL, label = NULL
       WHERE b."blockId" IN (
         SELECT id FROM "Block" WHERE title LIKE 'Vereinskontingent %'
       )
       AND b.status = 'RELEASED'
       AND NOT EXISTS (
         SELECT 1 FROM "Booking" o
         WHERE o."courtId" = b."courtId" AND o.id <> b.id
           AND o.status IN ('HOLD','PENDING_PAYMENT','CONFIRMED')
           AND o."startAt" < b."endAt" AND o."endAt" > b."startAt"
       )`,
    );
    await pool.query(
      `UPDATE "Booking" SET "clubConfirmedAt" = NULL
       WHERE "blockId" IN (
         SELECT id FROM "Block" WHERE title LIKE 'Vereinskontingent %'
       ) AND "clubConfirmedAt" IS NOT NULL`,
    );
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
