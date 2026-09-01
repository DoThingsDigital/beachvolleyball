import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Komplette Registrierungsreise (Ticket 1.8): Registrieren → Double-Opt-in
// (Token wird testseitig erzeugt, da die Mail nicht mitlesbar ist) →
// Passwort-Login → Profil mit Rechnungsadresse speichern.
// Chromium-only: legt echte Datensätze an, einmal pro Lauf reicht.

function pool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

test("Registrierung, Bestätigung, Login, Profil", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  const email = `e2e-reg-${Date.now()}@example.org`;
  const password = "e2e-passwort-123";

  // --- Registrieren ---------------------------------------------------------
  await page.goto("/registrieren");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-name").fill("E2E Testkunde");
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page).toHaveURL(/registrieren\/gesendet/);

  const db = pool();
  try {
    const { rows: users } = await db.query(
      `SELECT id, "emailVerified", "termsAcceptedVersion" FROM "User" WHERE email = $1`,
      [email],
    );
    expect(users).toHaveLength(1);
    expect(users[0].emailVerified).toBeNull();
    expect(users[0].termsAcceptedVersion).toBe("v1");

    const { rows: mails } = await db.query(
      `SELECT status FROM "EmailLog" WHERE "to" = $1 AND template = 'verify-email'`,
      [email],
    );
    expect(mails).toHaveLength(1);

    // --- Login vor Bestätigung wird abgelehnt -------------------------------
    await page.goto("/login");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByText("E-Mail-Adresse oder Passwort ist falsch."),
    ).toBeVisible();

    // --- Bestätigen (Token testseitig, gleiche Hash-Logik wie im Code) ------
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.query(
      `INSERT INTO "VerificationToken" (identifier, token, expires)
       VALUES ($1, $2, now() + interval '15 minutes')`,
      [`verify:${email}`, tokenHash],
    );
    await page.goto(
      `/registrieren/bestaetigen?email=${encodeURIComponent(email)}&token=${rawToken}`,
    );
    await expect(
      page.getByRole("heading", { name: "E-Mail bestätigt" }),
    ).toBeVisible();

    // --- Login nach Bestätigung ---------------------------------------------
    await page.goto("/login");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByTestId("session-email")).toHaveText(email);

    // --- Profil + Rechnungsadresse ------------------------------------------
    await page.locator("#profile-phone").fill("+49 221 123456");
    await page.locator("#profile-street").fill("Teststraße 12");
    await page.locator("#profile-zip").fill("51063");
    await page.locator("#profile-city").fill("Köln");
    await page.locator("#profile-country").fill("DE");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Gespeichert.");

    await page.reload();
    await expect(page.locator("#profile-street")).toHaveValue("Teststraße 12");

    // --- Unvollständige Adresse wird abgelehnt ------------------------------
    await page.locator("#profile-city").fill("");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(
      page.getByText(/Rechnungsadresse bitte vollständig/),
    ).toBeVisible();
  } finally {
    await db.end();
  }
});
