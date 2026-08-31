import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "../src/auth/password";
import { PrismaClient } from "../src/generated/prisma/client";

// Seed für lokale Entwicklung und E2E (Ticket 0.4: Organisation + Admin-User).
// Winter-1-Stammdaten (Venue, Courts, Season, Club, …) kommen mit Ticket 1.2.
// Idempotent: mehrfaches Ausführen ändert nichts am Ergebnis.

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD müssen gesetzt sein (.env, siehe .env.example).",
    );
  }
  if (adminPassword.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD muss mindestens 10 Zeichen haben (A1).");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ist nicht gesetzt.");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const organisation = await prisma.organisation.upsert({
      where: { slug: "dtd" },
      update: {},
      create: {
        slug: "dtd",
        name: "DoThingsDigital GmbH",
        settings: {},
      },
    });

    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash },
      create: {
        email: adminEmail,
        name: "Admin",
        passwordHash,
        emailVerified: new Date(),
      },
    });

    await prisma.membership.upsert({
      where: {
        userId_organisationId: {
          userId: admin.id,
          organisationId: organisation.id,
        },
      },
      update: { role: "ADMIN" },
      create: {
        userId: admin.id,
        organisationId: organisation.id,
        role: "ADMIN",
      },
    });

    console.log(
      `Seed ok: Organisation "${organisation.slug}", Admin ${admin.email}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
