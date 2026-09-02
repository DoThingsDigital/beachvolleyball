import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// A1-Nachtrag: Passwort vergessen → Reset-Link → neues Passwort → Login;
// danach eingeloggt Passwort ändern. Eigener Wegwerf-User (ohne Passwort,
// verifiziert) – der Reset-Flow setzt das Passwort erstmalig.

const EMAIL = "e2e-reset@example.org";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const org = await pool.query(`SELECT id FROM "Organisation" WHERE slug='dtd'`);
    await pool.query(
      `INSERT INTO "User" (id, email, name, "emailVerified", "passwordHash", "createdAt", "updatedAt")
       VALUES ('e2e-reset-user', $1, 'E2E Reset', now(), NULL, now(), now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = NULL`,
      [EMAIL],
    );
    await pool.query(
      `INSERT INTO "Membership" (id, "userId", "organisationId", role, "createdAt", "updatedAt")
       SELECT 'e2e-reset-mem', u.id, $2, 'CUSTOMER', now(), now() FROM "User" u WHERE u.email = $1
       ON CONFLICT ("userId", "organisationId") DO NOTHING`,
      [EMAIL, org.rows[0].id],
    );
  } finally {
    await pool.end();
  }
});

test("Passwort vergessen → zurücksetzen → anmelden → ändern", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  const password = `e2e-reset-${Date.now()}`;

  // Anfordern (enumeration-sichere Bestätigung)
  await page.goto("/login");
  await page.getByRole("link", { name: "Passwort vergessen?" }).click();
  await page.locator("#forgot-email").fill(EMAIL);
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByTestId("reset-sent")).toBeVisible();

  // Token testseitig einsetzen (Mail ist nicht mitlesbar; gleiche Hash-Logik)
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(`DELETE FROM "VerificationToken" WHERE identifier = $1`, [
      `pwreset:${EMAIL}`,
    ]);
    await db.query(
      `INSERT INTO "VerificationToken" (identifier, token, expires)
       VALUES ($1, $2, now() + interval '60 minutes')`,
      [`pwreset:${EMAIL}`, tokenHash],
    );
  } finally {
    await db.end();
  }

  // Neues Passwort setzen
  await page.goto(
    `/passwort-zuruecksetzen?email=${encodeURIComponent(EMAIL)}&token=${rawToken}`,
  );
  await page.locator("#reset-password").fill(password);
  await page.locator("#reset-password2").fill(password);
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page.getByText(/Passwort gespeichert/)).toBeVisible();

  // Login mit dem neuen Passwort
  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(EMAIL);

  // Eingeloggt: Passwort ändern (falsches aktuelles wird abgelehnt)
  const changed = `${password}-neu`;
  const pwForm = page.getByTestId("password-form");
  await pwForm.locator("#sec-current").fill("absichtlich-falsch");
  await pwForm.locator("#sec-new").fill(changed);
  await pwForm.locator("#sec-new2").fill(changed);
  await pwForm.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(
    pwForm.getByText("Das aktuelle Passwort ist falsch."),
  ).toBeVisible();

  await pwForm.locator("#sec-current").fill(password);
  await pwForm.locator("#sec-new").fill(changed);
  await pwForm.locator("#sec-new2").fill(changed);
  await pwForm.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(pwForm.getByText("Passwort geändert.")).toBeVisible();
});
