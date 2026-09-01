import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Nutzt eine Nicht-Zustell-Adresse: der Versandversuch wird protokolliert
// (SENT/FAILED/DEV_LOGGED), ohne echte Postfächer zu fluten.
const magicEmail = "e2e-magic-link@example.org";

test("Magic-Link-Anforderung durchläuft die Mail-Pipeline (EmailLog)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "nur einmal pro Lauf");

  const since = new Date();
  await page.goto("/login");
  await page.locator("#magic-email").fill(magicEmail);
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  // je nach Versandergebnis: link-gesendet, Auth-Zwischenstation oder
  // Fehlerhinweis – entscheidend ist der EmailLog-Eintrag
  await page.waitForLoadState("networkidle");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Versand + Log laufen serverseitig nach dem Submit weiter → pollen
    await expect
      .poll(
        async () => {
          const { rows } = await pool.query(
            `SELECT status, "templateVersion" FROM "EmailLog"
             WHERE "to" = $1 AND template = 'magic-link' AND "sentAt" >= $2
             ORDER BY "sentAt" DESC LIMIT 1`,
            [magicEmail, since],
          );
          return rows[0] ?? null;
        },
        { timeout: 20_000 },
      )
      .toMatchObject({ templateVersion: "v1" });
  } finally {
    await pool.end();
  }
});
