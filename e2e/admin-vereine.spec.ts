import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";

// 4.6-Nachtrag: Betreiber ernennt/entzieht Vereins-Admins in der
// Vereins-Konfiguration. Eigener Wegwerf-User, damit kein anderer Spec
// (SEED_CUSTOMER!) beeinflusst wird.

const APPOINTEE = "e2e-vorstand@example.org";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const orgRes = await pool.query(`SELECT id FROM "Organisation" WHERE slug='dtd'`);
    const orgId = orgRes.rows[0]?.id;
    if (!orgId) return;
    await pool.query(
      `INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
       VALUES ('e2e-vorstand-user', $1, 'E2E Vorstand', now(), now())
       ON CONFLICT (email) DO NOTHING`,
      [APPOINTEE],
    );
    const userRes = await pool.query(`SELECT id FROM "User" WHERE email=$1`, [APPOINTEE]);
    const userId = userRes.rows[0].id;
    await pool.query(
      `INSERT INTO "Membership" (id, "userId", "organisationId", role, "createdAt", "updatedAt")
       VALUES ('e2e-vorstand-mem', $1, $2, 'CUSTOMER', now(), now())
       ON CONFLICT ("userId", "organisationId") DO NOTHING`,
      [userId, orgId],
    );
    // Drift-Reset: vorherige Ernennung entfernen
    await pool.query(`DELETE FROM "ClubMembership" WHERE "userId" = $1`, [userId]);
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

test("Vereins-Admin ernennen und entziehen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  await login(page);
  await page.goto("/admin/konfiguration/vereine");
  await expect(
    page.getByRole("heading", { name: /^Vereine/ }),
  ).toBeVisible();

  const section = page.locator("[data-testid^=club-admins-]").first();
  await section.locator("input[name=email]").fill(APPOINTEE);
  await section
    .getByRole("button", { name: "Zum Vereins-Admin ernennen" })
    .click();
  await expect(
    section.locator("li", { hasText: APPOINTEE }),
  ).toBeVisible();

  await section
    .locator("li", { hasText: APPOINTEE })
    .getByRole("button", { name: "Entziehen" })
    .click();
  await expect(section.locator("li", { hasText: APPOINTEE })).toHaveCount(0);

  // Unbekannte E-Mail wird abgewiesen
  await section.locator("input[name=email]").fill("niemand-existiert@example.org");
  await section
    .getByRole("button", { name: "Zum Vereins-Admin ernennen" })
    .click();
  await expect(
    section.getByText(/Kein Konto mit dieser E-Mail/),
  ).toBeVisible();
});
