import { expect, test } from "@playwright/test";
// Direkter pg-Zugriff statt Prisma: der generierte Client ist ESM-only und
// kollidiert mit Playwrights CJS-Transpilierung.
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// Läuft gegen die Dev-DB des Webservers (DATABASE_URL aus .env).
function dbPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL fehlt.");
  return new Pool({ connectionString });
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login?callbackUrl=/admin/konfiguration/standort");
  await page.locator("#login-email").fill(adminEmail);
  await page.locator("#login-password").fill(adminPassword);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  // Großzügiges Timeout: der Dev-Server kompiliert die Route beim ersten Hit.
  await expect(
    page.getByRole("heading", { name: /Standort-Konfiguration/ }),
  ).toBeVisible({ timeout: 30_000 });
}

test("Konfiguration speichern erzeugt Audit-Eintrag und persistiert", async ({
  page,
}) => {
  await loginAsAdmin(page);

  const cancelHours = page.locator("#cancelHours");
  const current = Number(await cancelHours.inputValue());
  const next = current === 48 ? 49 : 48;

  const since = new Date();
  await cancelHours.fill(String(next));
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Gespeichert.");

  await page.reload();
  await expect(page.locator("#cancelHours")).toHaveValue(String(next));

  const pool = dbPool();
  try {
    const { rows } = await pool.query(
      `SELECT diff FROM "AuditLog"
       WHERE entity = 'Venue' AND action = 'venue.config.update' AND at >= $1
       ORDER BY at DESC LIMIT 1`,
      [since],
    );
    expect(rows).toHaveLength(1);
    const diff = rows[0].diff as Record<string, { old: unknown; new: unknown }>;
    expect(diff.cancelHours?.new).toBe(next);
  } finally {
    await pool.end();
  }
});

test("Zod-Validierung: Mindestdauer > Maximaldauer wird abgelehnt", async ({
  page,
}) => {
  await loginAsAdmin(page);

  await page.locator("#minDurationMin").fill("180");
  await page.locator("#maxDurationMin").fill("60");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(
    page.getByText("Mindestdauer darf die Maximaldauer nicht überschreiten."),
  ).toBeVisible();
});
