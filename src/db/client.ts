import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/src/generated/prisma/client";

// Singleton, damit Hot-Reload in `next dev` keine Verbindungen leakt.
// Direkter Zugriff auf diesen Client ist nur innerhalb von src/db/ erlaubt;
// alle Fachzugriffe laufen über Repositories mit TenantContext (Ticket 1.1).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ist nicht gesetzt");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Auch in Production auf globalThis: der Prod-Build bündelt Module mehrfach
// (Pages vs. Server Actions); ohne globalen Anker entstünde je Kopie ein
// eigener Connection-Pool.
export const prisma = (globalForPrisma.prisma ??= createClient());
