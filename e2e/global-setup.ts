import { execSync } from "node:child_process";

import { Pool } from "pg";

// Sorgt vor dem E2E-Lauf für den Seed-Stand (Admin-User für Login-Tests)
// und räumt Datenreste früherer Läufe ab (Testplätze deaktivieren).
// Voraussetzung: DB läuft (`pnpm db:up`) und Migrationen sind angewendet.
export default async function globalSetup() {
  execSync("pnpm seed", { stdio: "inherit" });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE "Court" SET active = false WHERE name LIKE 'E2E-Feld%'`,
    );
    // Testkäufe früherer Läufe stornieren, sonst fressen sie echte Slots
    await pool.query(
      `UPDATE "Booking" b SET status='CANCELLED', "cancelledAt"=now(), "cancelReason"='E2E_CLEANUP'
       FROM "User" u
       WHERE b."userId"=u.id AND u.email LIKE 'e2e-%@example.org'
         AND b.status IN ('HOLD','PENDING_PAYMENT','CONFIRMED')`,
    );
    await pool.query(
      `UPDATE "Subscription" s SET status='CANCELLED', "cancelledAt"=now(), "cancelReason"='E2E_CLEANUP'
       FROM "User" u
       WHERE s."userId"=u.id AND u.email LIKE 'e2e-%@example.org'
         AND s.status IN ('PENDING','ACTIVE')`,
    );
    // Abgelaufene Holds austragen (lokal läuft der Expire-Cron nicht):
    // sonst blockieren Admin-Testbuchungen früherer Läufe dauerhaft Slots.
    await pool.query(
      `UPDATE "Booking" SET status='EXPIRED'
       WHERE status='HOLD' AND "holdExpiresAt" < now()`,
    );
    // Preisregel aus dem Mehrplatz-Test (admin-preisregeln.spec) abräumen –
    // hier statt im Spec, damit kein paralleler Worker sie mittendrin löscht.
    await pool.query(
      `DELETE FROM "PriceRule" WHERE label = 'E2E-Zweifelder-Regel'`,
    );
    // E2E-Sperren (admin-sperren.spec) ebenfalls hier: ein beforeAll im Spec
    // läuft je Worker und würde parallel frisch angelegte Blöcke wegräumen.
    await pool.query(
      `DELETE FROM "Booking" WHERE "blockId" IN
         (SELECT id FROM "Block" WHERE title IN ('E2E-Wartung', 'E2E-Zeitraum'))`,
    );
    await pool.query(
      `DELETE FROM "Block" WHERE title IN ('E2E-Wartung', 'E2E-Zeitraum')`,
    );
  } finally {
    await pool.end();
  }
}
