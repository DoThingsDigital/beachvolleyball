import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { getSubscriptionAvailability } from "./subscription-availability";

// Integrationstest (Test-DB) für Ticket 2.1: Vereinskontingent-Block und
// bestehende Subscription reduzieren die freien Dauerplatz-Kombinationen.

let orgId: string;
let venueId: string;
let seasonId: string;
let courtA: string;
let courtB: string;

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Avail Org", slug: "org-avail" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "LE Avail",
      legalForm: "GmbH",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "AV",
      defaultTaxRateBp: 1900,
      email: "int-test-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Avail Venue",
      slug: "venue-avail",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      minDurationMin: 60,
      maxDurationMin: 120,
      openingHours: {
        mon: [["17:00", "22:00"]],
        thu: [["17:00", "22:00"]],
      },
    },
  });
  venueId = venue.id;

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Winter Test",
      startDate: new Date("2026-10-01T00:00:00+02:00"),
      endDate: new Date("2027-04-01T00:00:00+02:00"),
      status: "PRESALE",
    },
  });
  seasonId = season.id;

  const a = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld A" },
  });
  const b = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld B" },
  });
  courtA = a.id;
  courtB = b.id;

  const admin = await prisma.user.create({
    data: { email: "int-test-avail-admin@example.org", name: "Int Admin" },
  });
  const club = await prisma.club.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Int Club",
      contactEmail: "int-test-club@example.org",
    },
  });

  // Vereinskontingent: Feld A, Mo + Do, 18:00–22:00 lokal
  await prisma.block.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId: courtA,
      clubId: club.id,
      type: "VEREIN",
      title: "Kontingent Feld A",
      startAt: new Date("2026-10-01T16:00:00Z"), // 18:00 CEST
      endAt: new Date("2026-10-01T20:00:00Z"), // 22:00 CEST
      rrule: "FREQ=WEEKLY;BYDAY=MO,TH",
      createdByUserId: admin.id,
    },
  });

  // Bestehender Dauerplatz: Feld B, Donnerstag 19:00, 90 min
  await prisma.subscription.create({
    data: {
      organisationId: orgId,
      venueId,
      userId: admin.id,
      seasonId,
      courtId: courtB,
      weekday: 4,
      startTime: "19:00",
      durationMin: 90,
      dateFrom: season.startDate,
      dateTo: season.endDate,
      pricePerOccurrenceCents: 3000,
      totalCents: 30000,
      status: "PENDING",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getSubscriptionAvailability", () => {
  it("Kontingent-Block sperrt Feld A ab 18:00, davor bleibt frei", async () => {
    const result = await getSubscriptionAvailability(
      { organisationId: orgId },
      { venueId, seasonId },
    );
    const feldAMo = result.slots.filter(
      (s) => s.courtId === courtA && s.weekday === 1 && s.durationMin === 60,
    );
    // Fenster 17:00–22:00, Block 18:00–22:00 → nur 17:00 bleibt
    expect(feldAMo.map((s) => s.startTime)).toEqual(["17:00"]);
  });

  it("bestehender Dauerplatz sperrt nur seine Überlappung auf Feld B", async () => {
    const result = await getSubscriptionAvailability(
      { organisationId: orgId },
      { venueId, seasonId },
    );
    const feldBDo = result.slots.filter(
      (s) => s.courtId === courtB && s.weekday === 4 && s.durationMin === 60,
    );
    // Sub 19:00–20:30 → frei: 17:00, 17:30, 18:00, 20:30, 21:00
    expect(feldBDo.map((s) => s.startTime)).toEqual([
      "17:00",
      "17:30",
      "18:00",
      "20:30",
      "21:00",
    ]);
  });

  it("Dauern folgen aus Venue-Konfiguration (60/90/120 bei 30er-Raster)", async () => {
    const result = await getSubscriptionAvailability(
      { organisationId: orgId },
      { venueId, seasonId },
    );
    expect(result.durationsMin).toEqual([60, 90, 120]);
  });

  it("fremder Mandant sieht nichts", async () => {
    await expect(
      getSubscriptionAvailability(
        { organisationId: "fremd" },
        { venueId, seasonId },
      ),
    ).rejects.toThrow("Standort nicht gefunden.");
  });
});
