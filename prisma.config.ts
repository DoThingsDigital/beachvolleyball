import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Konfiguration für die Prisma-CLI (migrate, studio, generate).
// Die Laufzeit-Verbindung der App läuft über den Driver-Adapter in src/db/client.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
