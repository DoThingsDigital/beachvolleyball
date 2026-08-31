import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "../src/auth/password";
import { PrismaClient } from "../src/generated/prisma/client";

// Winter-1-Stammdaten (Ticket 1.2), idempotent: Upserts über natürliche
// Schlüssel (slug, email, unique-Kombis); Blocks/PriceRules über find-or-create.
//
// Quellen: docs/02_DATENMODELL.md "Seed für Winter 1" + Vorvertrag.
// PREISE SIND PLATZHALTER, bis die Werte aus Kalkulationstool_Picco_Beach_v2
// vorliegen (00_PROJEKTRAHMEN §8.3). Beach-Liga-Slots folgen nach Abstimmung
// mit Roland (Go-Live-Checkliste Stufe 2).

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
    // --- Organisation + Admin -------------------------------------------------
    const organisation = await prisma.organisation.upsert({
      where: { slug: "dtd" },
      update: {},
      create: {
        slug: "dtd",
        name: "DoThingsDigital GmbH",
        settings: {
          paypalEnabled: false,
          confirmOnProcessing: true,
        },
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

    // Optionaler Kunden-Testuser (für E2E-Guard-Tests); nur wenn Env gesetzt.
    const customerEmail = process.env.SEED_CUSTOMER_EMAIL;
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
    if (customerEmail && customerPassword) {
      const customerHash = await hashPassword(customerPassword);
      const customer = await prisma.user.upsert({
        where: { email: customerEmail },
        update: { passwordHash: customerHash },
        create: {
          email: customerEmail,
          name: "Test-Kunde",
          passwordHash: customerHash,
          emailVerified: new Date(),
        },
      });
      await prisma.membership.upsert({
        where: {
          userId_organisationId: {
            userId: customer.id,
            organisationId: organisation.id,
          },
        },
        update: { role: "CUSTOMER" },
        create: {
          userId: customer.id,
          organisationId: organisation.id,
          role: "CUSTOMER",
        },
      });
    }

    // --- Rechtsträger (Plan A aktiv, Plan B inaktiv) --------------------------
    async function upsertLegalEntity(data: {
      name: string;
      legalForm: string;
      invoicePrefix: string;
      email: string;
      active: boolean;
    }) {
      const existing = await prisma.legalEntity.findFirst({
        where: { organisationId: organisation.id, name: data.name },
      });
      if (existing) return existing;
      return prisma.legalEntity.create({
        data: {
          organisationId: organisation.id,
          name: data.name,
          legalForm: data.legalForm,
          street: "Musterstraße 1", // TODO: echte Adresse vor Go-Live (Checkliste Stufe 1)
          zip: "51063",
          city: "Köln",
          invoicePrefix: data.invoicePrefix,
          defaultTaxRateBp: 1900, // 19 % – vor erster Rechnung mit Steuerberater bestätigen
          email: data.email,
          active: data.active,
        },
      });
    }

    const dtdEntity = await upsertLegalEntity({
      name: "DoThingsDigital GmbH",
      legalForm: "GmbH",
      invoicePrefix: "PB",
      email: "lets@dothingsdigital.de",
      active: true,
    });
    await upsertLegalEntity({
      name: "Beachclub-Köln e.V.",
      legalForm: "e.V.",
      invoicePrefix: "BC",
      email: "info@beachclub-koeln.de",
      active: false, // Plan B – Umschalten ist Konfiguration, keine Migration
    });

    // --- Standort Picco Beach -------------------------------------------------
    const venue = await prisma.venue.upsert({
      where: { slug: "picco-beach" },
      update: {},
      create: {
        organisationId: organisation.id,
        legalEntityId: dtdEntity.id,
        name: "Picco Beach",
        slug: "picco-beach",
        street: "Pfälzischer Ring 100", // TODO: Adresse prüfen
        zip: "51063",
        city: "Köln",
        openingHours: {
          mon: [["08:00", "22:00"]],
          tue: [["08:00", "22:00"]],
          wed: [["08:00", "22:00"]],
          thu: [["08:00", "22:00"]],
          fri: [["08:00", "22:00"]],
          sat: [["09:00", "21:00"]],
          sun: [["09:00", "21:00"]],
        },
        closedDates: ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31", "2027-01-01"],
      },
    });

    const courtNames = ["Feld 1", "Feld 2", "Feld 3", "Feld 4"]; // N aus Hallenszenario, ggf. anpassen
    const courts = [];
    for (const [i, name] of courtNames.entries()) {
      const existing = await prisma.court.findFirst({
        where: { venueId: venue.id, name },
      });
      courts.push(
        existing ??
          (await prisma.court.create({
            data: {
              organisationId: organisation.id,
              venueId: venue.id,
              name,
              sortOrder: i,
              courtGroup: "Halle",
            },
          })),
      );
    }

    // --- Saison Winter 2026/27 ------------------------------------------------
    let season = await prisma.season.findFirst({
      where: { venueId: venue.id, name: "Winter 2026/27" },
    });
    season ??= await prisma.season.create({
      data: {
        organisationId: organisation.id,
        venueId: venue.id,
        name: "Winter 2026/27",
        // Enddatum unter Vorbehalt Standzeit-Genehmigung (Fliegender Bau)
        startDate: new Date("2026-10-01T00:00:00+02:00"),
        endDate: new Date("2027-04-01T00:00:00+02:00"),
        presaleStart: new Date("2026-10-02T00:00:00+02:00"),
        status: "PRESALE",
        subscriptionDiscountBp: 1000, // 10 % – PLATZHALTER bis Kalkulationstool
      },
    });

    // --- Verein + Kontingent-Blocks -------------------------------------------
    let club = await prisma.club.findFirst({
      where: { venueId: venue.id, name: "Beachclub-Köln e.V." },
    });
    club ??= await prisma.club.create({
      data: {
        organisationId: organisation.id,
        venueId: venue.id,
        name: "Beachclub-Köln e.V.",
        contactEmail: "info@beachclub-koeln.de",
      },
    });

    // Vorvertrag: zwei Plätze Mo–Do 18–22 Uhr über die Saison.
    // 01.10.2026 ist ein Donnerstag (CEST, +02:00).
    for (const court of courts.slice(0, 2)) {
      const title = `Vereinskontingent ${court.name}`;
      const existing = await prisma.block.findFirst({
        where: { venueId: venue.id, courtId: court.id, title },
      });
      if (!existing) {
        await prisma.block.create({
          data: {
            organisationId: organisation.id,
            venueId: venue.id,
            courtId: court.id,
            clubId: club.id,
            type: "VEREIN",
            title,
            startAt: new Date("2026-10-01T18:00:00+02:00"),
            endAt: new Date("2026-10-01T22:00:00+02:00"),
            rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20270331T215959Z",
            createdByUserId: admin.id,
          },
        });
      }
    }

    // --- Preisregeln (PLATZHALTER – Werte aus Kalkulationstool v2 eintragen!) --
    const priceRules = [
      {
        label: "Off-Peak Mo–Fr",
        weekdays: [1, 2, 3, 4, 5],
        timeFrom: "08:00",
        timeTo: "17:00",
        pricePerHourCents: 2600,
        memberPricePerHourCents: 2200,
        priority: 10,
      },
      {
        label: "Peak Mo–Fr",
        weekdays: [1, 2, 3, 4, 5],
        timeFrom: "17:00",
        timeTo: "22:00",
        pricePerHourCents: 3400,
        memberPricePerHourCents: 2900,
        priority: 20,
      },
      {
        label: "Wochenende",
        weekdays: [6, 7],
        timeFrom: "09:00",
        timeTo: "21:00",
        pricePerHourCents: 3000,
        memberPricePerHourCents: 2600,
        priority: 20,
      },
    ];
    for (const rule of priceRules) {
      const existing = await prisma.priceRule.findFirst({
        where: { seasonId: season.id, label: rule.label },
      });
      if (!existing) {
        await prisma.priceRule.create({
          data: {
            ...rule,
            organisationId: organisation.id,
            venueId: venue.id,
            seasonId: season.id,
          },
        });
      }
    }

    console.log(
      `Seed ok: ${organisation.slug} · ${venue.slug} (${courts.length} Courts) · ` +
        `Season "${season.name}" · Club "${club.name}" · Admin ${admin.email}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
