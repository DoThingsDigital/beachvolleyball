import { TZDate } from "@date-fns/tz";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { BLOCK_RULE_CANCEL_REASON } from "@/src/db/blocks";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { listBlockOccurrences } from "@/src/domain/block-occurrences";
import { createBlock, endBlock, materializeBlock, updateBlock } from "./blocks";
import { getWeekOccupancy, invalidateOccupancyCache } from "./occupancy";

// Ticket 5.1: Materialisierung von Sperren in Belegungen – idempotent,
// ohne Verlust bestätigter Termine, Konflikte werden übersprungen.

const TZ = "Europe/Berlin";
const ALL_DAY: [string, string][] = [["08:00", "22:00"]];

let orgId: string;
let venueId: string;
let court1: string;
let court2: string;
let clubId: string;
let adminId: string;
let seasonFrom: Date;
let seasonTo: Date;

const ctx = () => ({ organisationId: orgId });

/** "YYYY-MM-DD" des nächsten Wochentags (ISO 1–7) ab morgen. */
function nextWeekdayDate(isoWeekday: number): string {
  const d = new Date(Date.now() + 86_400_000);
  for (let i = 0; i < 7; i++) {
    const utcDay = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + i, 12),
    );
    const wd = utcDay.getUTCDay() === 0 ? 7 : utcDay.getUTCDay();
    if (wd === isoWeekday) return utcDay.toISOString().slice(0, 10);
  }
  throw new Error("unreachable");
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Block Org", slug: "org-blocks" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Block GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "BL",
      defaultTaxRateBp: 1900,
      email: "int-test-bl-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Block Venue",
      slug: "venue-blocks",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      slotMinutes: 60,
      openingHours: {
        mon: ALL_DAY,
        tue: ALL_DAY,
        wed: ALL_DAY,
        thu: ALL_DAY,
        fri: ALL_DAY,
        sat: ALL_DAY,
        sun: ALL_DAY,
      },
    },
  });
  venueId = venue.id;
  court1 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld B1" },
    })
  ).id;
  court2 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld B2" },
    })
  ).id;
  clubId = (
    await prisma.club.create({
      data: {
        organisationId: orgId,
        venueId,
        name: "Block Verein",
        contactEmail: "int-test-bl-club@example.org",
      },
    })
  ).id;
  adminId = (
    await prisma.user.create({
      data: { email: "int-test-bl-admin@example.org", name: "Block Admin" },
    })
  ).id;

  seasonFrom = new Date(Date.now() - 86_400_000);
  seasonTo = new Date(Date.now() + 28 * 86_400_000);
  await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Block Saison",
      startDate: seasonFrom,
      endDate: seasonTo,
      status: "ACTIVE",
      subscriptionDiscountBp: 0,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("materializeBlock (5.1, E1/E2)", () => {
  let blockId: string;

  it("wöchentliche Sperre wird als Belegungen materialisiert", async () => {
    const { blockId: id, materialized } = await createBlock(
      ctx(),
      {
        venueId,
        courtId: court1,
        type: "VEREIN",
        title: "Kontingent B1",
        clubId,
        date: nextWeekdayDate(1),
        timeFrom: "18:00",
        timeTo: "22:00",
        weekdays: [1, 2],
      },
      adminId,
    );
    blockId = id;

    const block = await prisma.block.findUniqueOrThrow({ where: { id } });
    const expected = listBlockOccurrences({
      block,
      timezone: TZ,
      windowFrom: new Date(),
      windowTo: seasonTo,
    });
    expect(expected.length).toBeGreaterThanOrEqual(6);
    expect(materialized.created).toBe(expected.length);
    expect(materialized.skippedConflicts).toHaveLength(0);

    const bookings = await prisma.booking.findMany({
      where: { blockId: id, status: "CONFIRMED" },
    });
    expect(bookings).toHaveLength(expected.length);
    expect(
      bookings.every(
        (b) =>
          b.kind === "BLOCK" &&
          b.usageType === "VEREIN" &&
          b.source === "BLOCK" &&
          b.clubId === clubId,
      ),
    ).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Block", entityId: id, action: "CREATE" },
    });
    expect(audit).not.toBeNull();
  });

  it("erneute Materialisierung ist ein No-op (idempotent)", async () => {
    const result = await materializeBlock(ctx(), blockId, {
      actorUserId: adminId,
    });
    expect(result.created).toBe(0);
    expect(result.cancelled).toBe(0);
    expect(result.kept).toBeGreaterThanOrEqual(6);
  });

  it("Regeländerung storniert weggefallene Termine, behält bestehende (gleiche IDs)", async () => {
    const before = await prisma.booking.findMany({
      where: { blockId, status: "CONFIRMED" },
    });
    const mondayIds = new Set(
      before
        .filter((b) => {
          const wd = new Date(b.startAt).getUTCDay();
          return (wd === 0 ? 7 : wd) === 1;
        })
        .map((b) => b.id),
    );

    // Di raus, nur noch Mo
    const result = await updateBlock(
      ctx(),
      blockId,
      {
        venueId,
        courtId: court1,
        type: "VEREIN",
        title: "Kontingent B1",
        clubId,
        date: nextWeekdayDate(1),
        timeFrom: "18:00",
        timeTo: "22:00",
        weekdays: [1],
      },
      adminId,
    );
    expect(result.cancelled).toBeGreaterThanOrEqual(3);
    expect(result.created).toBe(0);

    const after = await prisma.booking.findMany({
      where: { blockId, status: "CONFIRMED" },
    });
    // Mo-Termine überleben mit unveränderter ID
    expect(new Set(after.map((b) => b.id))).toEqual(mondayIds);

    const cancelled = await prisma.booking.findMany({
      where: { blockId, status: "CANCELLED" },
    });
    expect(
      cancelled.every((b) => b.cancelReason === BLOCK_RULE_CANCEL_REASON),
    ).toBe(true);
  });

  it("regelgetriebene Stornos leben bei erneuter Ausweitung wieder auf", async () => {
    const result = await updateBlock(
      ctx(),
      blockId,
      {
        venueId,
        courtId: court1,
        type: "VEREIN",
        title: "Kontingent B1",
        clubId,
        date: nextWeekdayDate(1),
        timeFrom: "18:00",
        timeTo: "22:00",
        weekdays: [1, 2],
      },
      adminId,
    );
    expect(result.created).toBeGreaterThanOrEqual(3);
    expect(result.cancelled).toBe(0);
  });

  it("manuell stornierte Termine bleiben gestrichen", async () => {
    const one = await prisma.booking.findFirstOrThrow({
      where: { blockId, status: "CONFIRMED" },
      orderBy: { startAt: "asc" },
    });
    await prisma.booking.update({
      where: { id: one.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: "MANUELL",
      },
    });

    const result = await materializeBlock(ctx(), blockId, {
      actorUserId: adminId,
    });
    expect(result.created).toBe(0);

    const again = await prisma.booking.findMany({
      where: { blockId, startAt: one.startAt, endAt: one.endAt },
    });
    expect(again).toHaveLength(1);
    expect(again[0]?.status).toBe("CANCELLED");
  });

  it("Konflikt mit bestehender Buchung wird übersprungen und gemeldet", async () => {
    // Kundenbuchung auf Feld B2, nächster Mittwoch 18:00–19:00
    const buyer = await prisma.user.create({
      data: { email: "int-test-bl-buyer@example.org" },
    });
    const wednesday = nextWeekdayDate(3);
    const [y, m, d] = wednesday.split("-").map(Number);
    const clash = await prisma.booking.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId: court2,
        startAt: new Date(new TZDate(y!, m! - 1, d!, 18, 0, TZ).getTime()),
        endAt: new Date(new TZDate(y!, m! - 1, d!, 19, 0, TZ).getTime()),
        kind: "CUSTOMER",
        status: "CONFIRMED",
        usageType: "KOMMERZIELL",
        source: "ONLINE",
        userId: buyer.id,
      },
    });

    const { materialized } = await createBlock(
      ctx(),
      {
        venueId,
        courtId: court2,
        type: "WARTUNG",
        title: "Wartung B2",
        date: wednesday,
        timeFrom: "18:00",
        timeTo: "20:00",
        weekdays: [3],
      },
      adminId,
    );
    expect(materialized.skippedConflicts.map((d) => d.getTime())).toContain(
      clash.startAt.getTime(),
    );
    expect(materialized.created).toBeGreaterThanOrEqual(2);
  });

  it("Belegungskalender zeigt materialisierte Sperre als VEREIN, RELEASED als frei", async () => {
    // Ersten noch bestätigten Termin der Serie nehmen (der allererste wurde
    // im vorherigen Test manuell storniert)
    const confirmed = await prisma.booking.findFirstOrThrow({
      where: { blockId, status: "CONFIRMED" },
      orderBy: { startAt: "asc" },
    });
    const local = new TZDate(confirmed.startAt.getTime(), TZ);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;

    invalidateOccupancyCache();
    const week = await getWeekOccupancy(ctx(), { venueId, startDate: date });
    const day = week.days.find((d) => d.date === date)!;
    const evening = day.slots.find((s) => s.time === "18:00")!;
    expect(evening.states[court1]).toBe("VEREIN");
    const morning = day.slots.find((s) => s.time === "10:00")!;
    expect(morning.states[court1]).toBe("FREI");

    // Freigabe: RELEASED blockiert nicht mehr
    await prisma.booking.update({
      where: { id: confirmed.id },
      data: { status: "RELEASED" },
    });
    invalidateOccupancyCache();
    const week2 = await getWeekOccupancy(ctx(), { venueId, startDate: date });
    const evening2 = week2.days
      .find((d) => d.date === date)!
      .slots.find((s) => s.time === "18:00")!;
    expect(evening2.states[court1]).toBe("FREI");
  });

  it("endBlock storniert zukünftige Termine und begrenzt die Regel", async () => {
    const { cancelled } = await endBlock(ctx(), blockId, adminId);
    expect(cancelled).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.booking.count({
      where: { blockId, status: "CONFIRMED", startAt: { gte: new Date() } },
    });
    expect(remaining).toBe(0);

    const block = await prisma.block.findUniqueOrThrow({ where: { id: blockId } });
    expect(block.rrule).toMatch(/UNTIL=\d{8}T\d{6}Z/);

    // Materialisierung nach dem Ende erzeugt nichts Neues
    const again = await materializeBlock(ctx(), blockId, { actorUserId: adminId });
    expect(again.created).toBe(0);
  });
});

describe("Ganztages-Zeitraum (dateTo)", () => {
  /** "YYYY-MM-DD" (UTC-Mittag, DST-neutral) in n Tagen. */
  function dateStr(offsetDays: number): string {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12),
    )
      .toISOString()
      .slice(0, 10);
  }

  it("legt je Tag eine ganztägige Belegung an; Konflikt betrifft nur seinen Tag", async () => {
    const from = dateStr(10);
    const middle = dateStr(11);
    const to = dateStr(12);

    // Bestehende Kundenbuchung am mittleren Tag → nur dieser Tag scheitert
    const [y, m, d] = middle.split("-").map(Number);
    await prisma.booking.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId: court2,
        startAt: new Date(new TZDate(y!, m! - 1, d!, 10, 0, TZ).getTime()),
        endAt: new Date(new TZDate(y!, m! - 1, d!, 11, 0, TZ).getTime()),
        kind: "CUSTOMER",
        status: "CONFIRMED",
        usageType: "KOMMERZIELL",
        source: "ONLINE",
        userId: adminId,
      },
    });

    const { blockId, materialized } = await createBlock(
      ctx(),
      {
        venueId,
        courtId: court2,
        type: "GESPERRT",
        title: "Umbau komplett",
        date: from,
        dateTo: to,
        timeFrom: "",
        timeTo: "",
      },
      adminId,
    );
    expect(materialized.created).toBe(2);
    expect(materialized.skippedConflicts).toHaveLength(1);

    const bookings = await prisma.booking.findMany({
      where: { blockId, status: "CONFIRMED" },
      orderBy: { startAt: "asc" },
    });
    expect(bookings).toHaveLength(2);
    // Tagesgrenzen liegen auf lokal 00:00 und decken je 24 h ab
    for (const b of bookings) {
      const local = new TZDate(b.startAt.getTime(), TZ);
      expect(local.getHours()).toBe(0);
      expect(local.getMinutes()).toBe(0);
      const hours =
        (b.endAt.getTime() - b.startAt.getTime()) / 3_600_000;
      expect([23, 24, 25]).toContain(hours);
    }

    // Der ganze Tag ist im Wochenraster gesperrt
    invalidateOccupancyCache();
    const week = await getWeekOccupancy(ctx(), {
      venueId,
      startDate: from,
    });
    const day = week.days.find((x) => x.date === from)!;
    expect(day.slots.every((s) => s.states[court2] !== "FREI")).toBe(true);
  });

  it("lehnt Zeitraum plus Wochentags-Serie ab", async () => {
    await expect(
      createBlock(
        ctx(),
        {
          venueId,
          courtId: court1,
          type: "GESPERRT",
          title: "Ungültige Kombi",
          date: dateStr(14),
          dateTo: dateStr(15),
          timeFrom: "",
          timeTo: "",
          weekdays: [1, 2],
        },
        adminId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });

  it("lehnt Bis-Datum vor dem Beginn ab", async () => {
    await expect(
      createBlock(
        ctx(),
        {
          venueId,
          courtId: court1,
          type: "GESPERRT",
          title: "Rueckwaerts",
          date: dateStr(15),
          dateTo: dateStr(14),
          timeFrom: "",
          timeTo: "",
        },
        adminId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });
});
