import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { getWeekOccupancy, invalidateOccupancyCache } from "./occupancy";

// Ticket 4.1 (D1): Wochenbelegung mit Zuständen; Performance < 1 s.

let orgId: string;
let venueId: string;
let courtA: string;
let courtB: string;

beforeAll(async () => {
  await cleanupTestDb();
  invalidateOccupancyCache();

  const org = await prisma.organisation.create({
    data: { name: "Occ Org", slug: "org-occupancy" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Occ GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "OC",
      defaultTaxRateBp: 1900,
      email: "int-test-occ-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Occ Venue",
      slug: "venue-occupancy",
      street: "Weg 1",
      zip: "50667",
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
    },
  });
  venueId = venue.id;
  const a = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld A" },
  });
  const b = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld B" },
  });
  courtA = a.id;
  courtB = b.id;

  const admin = await prisma.user.create({
    data: { email: "int-test-occ-admin@example.org" },
  });

  // Vereinskontingent: Feld A, Mo+Do 18–22 lokal
  await prisma.block.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId: courtA,
      type: "VEREIN",
      title: "Kontingent",
      startAt: new Date("2026-10-01T16:00:00Z"),
      endAt: new Date("2026-10-01T20:00:00Z"),
      rrule: "FREQ=WEEKLY;BYDAY=MO,TH",
      createdByUserId: admin.id,
    },
  });
  // Einmalige Wartung: Feld B, Di 03.11. 10–12 lokal (09–11Z, CET)
  await prisma.block.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId: courtB,
      type: "WARTUNG",
      title: "Netz tauschen",
      startAt: new Date("2026-11-03T09:00:00Z"),
      endAt: new Date("2026-11-03T11:00:00Z"),
      rrule: null,
      createdByUserId: admin.id,
    },
  });
  // Kundenbuchung: Feld B, Mo 02.11. 19–20 lokal (18–19Z)
  await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId: courtB,
      startAt: new Date("2026-11-02T18:00:00Z"),
      endAt: new Date("2026-11-02T19:00:00Z"),
      kind: "CUSTOMER",
      status: "CONFIRMED",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId: admin.id,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getWeekOccupancy (4.1)", () => {
  it("liefert Zustände je Tag, Slot und Platz", async () => {
    const week = await getWeekOccupancy(
      { organisationId: orgId },
      { venueId, startDate: "2026-11-02" }, // Montag
    );
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toMatchObject({ date: "2026-11-02", weekday: 1 });

    const monday = week.days[0]!;
    const at = (t: string) => monday.slots.find((s) => s.time === t)!;
    expect(at("19:00").states[courtA]).toBe("VEREIN"); // Kontingent Mo abends
    expect(at("19:00").states[courtB]).toBe("BELEGT"); // Kundenbuchung
    expect(at("10:00").states[courtA]).toBe("FREI");

    const tuesday = week.days[1]!;
    const atTue = (t: string) => tuesday.slots.find((s) => s.time === t)!;
    expect(atTue("10:00").states[courtB]).toBe("GESPERRT"); // Wartung
    expect(atTue("12:00").states[courtB]).toBe("FREI");
    expect(atTue("19:00").states[courtA]).toBe("FREI"); // Di kein Kontingent

    const thursday = week.days[3]!;
    expect(
      thursday.slots.find((s) => s.time === "18:00")!.states[courtA],
    ).toBe("VEREIN");
  });

  it("Performance: Woche mit 300 Buchungen < 1 s (DoD)", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => {
      const day = 9 + (i % 5); // 09.–13.11.
      const hour = 8 + (i % 13);
      return {
        organisationId: orgId,
        venueId,
        courtId: i % 2 === 0 ? courtA : courtB,
        startAt: new Date(Date.UTC(2026, 10, day, hour, 0)),
        endAt: new Date(Date.UTC(2026, 10, day, hour, 30)),
        kind: "CUSTOMER" as const,
        status: "CANCELLED" as const, // zählt nicht, testet nur Datenvolumen
        usageType: "KOMMERZIELL" as const,
        source: "ADMIN" as const,
      };
    });
    await prisma.booking.createMany({ data: rows });

    invalidateOccupancyCache();
    const start = performance.now();
    await getWeekOccupancy(
      { organisationId: orgId },
      { venueId, startDate: "2026-11-09" },
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it("zweiter Abruf kommt aus dem Cache (deutlich schneller, identisch)", async () => {
    const first = await getWeekOccupancy(
      { organisationId: orgId },
      { venueId, startDate: "2026-11-02" },
    );
    const start = performance.now();
    const second = await getWeekOccupancy(
      { organisationId: orgId },
      { venueId, startDate: "2026-11-02" },
    );
    expect(performance.now() - start).toBeLessThan(5);
    expect(second).toBe(first);
  });

  it("fremder Mandant sieht nichts", async () => {
    await expect(
      getWeekOccupancy(
        { organisationId: "fremd" },
        { venueId, startDate: "2026-11-02" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
