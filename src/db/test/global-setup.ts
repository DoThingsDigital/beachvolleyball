import { execSync } from "node:child_process";

// Bringt die Test-DB vor dem Integrationslauf auf den Migrationsstand.
export default function globalSetup() {
  const testUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST (oder DATABASE_URL) muss gesetzt sein.");
  }
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
