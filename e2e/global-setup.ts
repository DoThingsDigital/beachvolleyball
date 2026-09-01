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
  } finally {
    await pool.end();
  }
}
