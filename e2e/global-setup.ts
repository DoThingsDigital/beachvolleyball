import { execSync } from "node:child_process";

// Sorgt vor dem E2E-Lauf für den Seed-Stand (Admin-User für Login-Tests).
// Voraussetzung: DB läuft (`pnpm db:up`) und Migrationen sind angewendet.
export default function globalSetup() {
  execSync("pnpm seed", { stdio: "inherit" });
}
