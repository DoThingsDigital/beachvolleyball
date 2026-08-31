import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integrationstests laufen gegen die Test-DB, nie gegen die Dev-DB.
const testUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!testUrl) {
  throw new Error("DATABASE_URL_TEST (oder DATABASE_URL) muss gesetzt sein.");
}
process.env.DATABASE_URL = testUrl;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\//, replacement: fileURLToPath(new URL("./src/components/", import.meta.url)) },
      { find: /^@\/lib\//, replacement: fileURLToPath(new URL("./src/lib/", import.meta.url)) },
      { find: /^@\/hooks\//, replacement: fileURLToPath(new URL("./src/hooks/", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.int.test.ts"],
    environment: "node",
    globalSetup: "./src/db/test/global-setup.ts",
    // gemeinsame DB → Testdateien seriell ausführen
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
