import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";

// Verschickt eine echte Mail (Resend-Testabsender liefert nur an die eigene
// Adresse) – deshalb nur im Chromium-Projekt, eine Mail pro Testlauf.
test("Magic-Link-Anforderung versendet Mail und schreibt EmailLog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "nur einmal pro Lauf");

  const since = new Date();
  await page.goto("/login");
  await page.locator("#magic-email").fill(adminEmail);
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  // Server-Action-Redirectkette: je nach Timing ist die sichtbare URL noch
  // die Auth.js-Zwischenstation; entscheidend ist der Versand (EmailLog).
  await expect(page).toHaveURL(/link-gesendet|verify-request/);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT status, "templateVersion", "providerMessageId" FROM "EmailLog"
       WHERE "to" = $1 AND template = 'magic-link' AND "sentAt" >= $2
       ORDER BY "sentAt" DESC LIMIT 1`,
      [adminEmail, since],
    );
    expect(rows).toHaveLength(1);
    expect(["SENT", "DEV_LOGGED"]).toContain(rows[0].status);
    expect(rows[0].templateVersion).toBe("v1");
  } finally {
    await pool.end();
  }
});
