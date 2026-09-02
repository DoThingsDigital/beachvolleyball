import { TZDate } from "@date-fns/tz";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import {
  confirmQuotaBooking,
  findReleasedQuotaForSlot,
  findUpcomingQuotaBookings,
  releaseQuotaBookingByClub,
  setQuotaBookingLabel,
} from "@/src/db/club-quota";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createSingleBookingOrder } from "./single-booking";
import { releaseUnconfirmedQuota } from "./quota-release";

// Tickets 5.2/5.3 (E3/E4): Freigabe-Cron für unbestätigtes Kontingent,
// Vereinsbestätigung, Weiterverkauf als RELEASE_RESALE.

const TZ = "Europe/Berlin";
const ALL_DAY: [string, string][] = [["08:00", "22:00"]];

let orgId: string;
let venueId: string;
let courtId: string;
let clubId: string;
let blockId: string;
let adminId: string;

const ctx = () => ({ organisationId: orgId });

function bookingAt(daysFromNow: number, hour: number) {
  const base = new Date(Date.now() + daysFromNow * 86_400_000);
  const local = new TZDate(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hour,
    0,
    TZ,
  );
  const startAt = new Date(local.getTime());
  return { startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) };
}

async function createQuotaBooking(daysFromNow: number, hour: number) {
  const { startAt, endAt } = bookingAt(daysFromNow, hour);
  return prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      blockId,
      clubId,
      startAt,
      endAt,
      kind: "BLOCK",
      status: "CONFIRMED",
      usageType: "VEREIN",
      source: "BLOCK",
      confirmedAt: new Date(),
    },
  });
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Quota Org", slug: "org-quota" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Quota GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "QU",
      defaultTaxRateBp: 1900,
      email: "int-test-qu-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Quota Venue",
      slug: "venue-quota",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      slotMinutes: 60,
      releaseHoursBefore: 48,
      leadTimeMin: 60,
      horizonDays: 14,
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
  courtId = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld Q" },
    })
  ).id;
  clubId = (
    await prisma.club.create({
      data: {
        organisationId: orgId,
        venueId,
        name: "Quota Verein",
        contactEmail: "int-test-qu-club@example.org",
      },
    })
  ).id;
  adminId = (
    await prisma.user.create({
      data: { email: "int-test-qu-admin@example.org" },
    })
  ).id;
  blockId = (
    await prisma.block.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId,
        clubId,
        type: "VEREIN",
        title: "Quota Kontingent",
        startAt: bookingAt(1, 18).startAt,
        endAt: bookingAt(1, 19).startAt,
        rrule: null,
        createdByUserId: adminId,
      },
    })
  ).id;

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Quota Saison",
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 28 * 86_400_000),
      status: "ACTIVE",
      subscriptionDiscountBp: 0,
    },
  });
  await prisma.priceRule.create({
    data: {
      organisationId: orgId,
      venueId,
      seasonId: season.id,
      courtIds: [],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timeFrom: "08:00",
      timeTo: "22:00",
      pricePerHourCents: 3000,
      priority: 10,
      label: "Quota Regel",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("releaseUnconfirmedQuota (5.2, E3)", () => {
  it("gibt unbestätigte Termine in der Frist frei, bestätigte nicht", async () => {
    const inWindow = await createQuotaBooking(1, 18); // < 48 h
    const confirmedInWindow = await createQuotaBooking(1, 19);
    const outsideWindow = await createQuotaBooking(7, 18); // > 48 h

    await confirmQuotaBooking(ctx(), clubId, confirmedInWindow.id);

    const result = await releaseUnconfirmedQuota();
    expect(result.released).toBe(1);

    const rows = await prisma.booking.findMany({
      where: {
        id: { in: [inWindow.id, confirmedInWindow.id, outsideWindow.id] },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(inWindow.id)).toBe("RELEASED");
    expect(byId.get(confirmedInWindow.id)).toBe("CONFIRMED");
    expect(byId.get(outsideWindow.id)).toBe("CONFIRMED");

    // Idempotent: zweiter Lauf gibt nichts weiter frei
    const second = await releaseUnconfirmedQuota();
    expect(second.released).toBe(0);
  });

  it("releaseHoursBefore=0: fest reserviert, wird nie freigegeben", async () => {
    const fixedBlock = await prisma.block.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId,
        clubId,
        type: "VEREIN",
        title: "Fix reserviert",
        startAt: bookingAt(2, 8).startAt,
        endAt: bookingAt(2, 9).startAt,
        rrule: null,
        releaseHoursBefore: 0,
        createdByUserId: (
          await prisma.user.findFirstOrThrow({
            where: { email: "int-test-qu-admin@example.org" },
          })
        ).id,
      },
    });
    const { startAt, endAt } = bookingAt(1, 8); // morgen früh, tief in der 48h-Frist
    const fixedBooking = await prisma.booking.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId,
        blockId: fixedBlock.id,
        clubId,
        startAt,
        endAt,
        kind: "BLOCK",
        status: "CONFIRMED",
        usageType: "VEREIN",
        source: "BLOCK",
        confirmedAt: new Date(),
      },
    });

    await releaseUnconfirmedQuota();
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: fixedBooking.id },
    });
    expect(row.status).toBe("CONFIRMED"); // bleibt beim Verein
  });

  it("Block-Override der Frist schlägt den Venue-Default", async () => {
    // Block mit 200 h Vorlauf: auch der 7-Tage-Termin ist fällig
    await prisma.block.update({
      where: { id: blockId },
      data: { releaseHoursBefore: 200 },
    });
    const result = await releaseUnconfirmedQuota();
    expect(result.released).toBe(1); // der 7-Tage-Termin
    await prisma.block.update({
      where: { id: blockId },
      data: { releaseHoursBefore: null },
    });
  });
});

describe("Weiterverkauf freigegebener Slots (E3)", () => {
  it("Buchung auf freigegebenem Slot wird RELEASE_RESALE mit Referenz", async () => {
    const released = await prisma.booking.findFirstOrThrow({
      where: { blockId, status: "RELEASED" },
      orderBy: { startAt: "asc" },
    });

    const found = await findReleasedQuotaForSlot(ctx(), {
      courtId,
      startAt: released.startAt,
      endAt: released.endAt,
    });
    expect(found?.id).toBe(released.id);

    const buyer = await prisma.user.create({
      data: {
        email: "int-test-qu-buyer@example.org",
        name: "Quota Käufer",
        billingStreet: "Weg 2",
        billingZip: "50667",
        billingCity: "Köln",
        billingCountry: "DE",
      },
    });
    const local = new TZDate(released.startAt.getTime(), TZ);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;

    const { orderId } = await createSingleBookingOrder(ctx(), {
      userId: buyer.id,
      venueId,
      courtId,
      date,
      time,
      durationMin: 60,
    });

    const booking = await prisma.booking.findFirstOrThrow({
      where: { orderItem: { orderId } },
    });
    expect(booking.source).toBe("RELEASE_RESALE");
    expect(booking.note).toContain(released.id);
    // Exclusion-Constraint stört nicht: RELEASED blockiert nicht
    expect(booking.status).toBe("HOLD");
  });
});

describe("Vereins-Kontingent-Sicht (5.3, E4)", () => {
  it("listet kommende Termine, Label setzen, Freigeben per Hand", async () => {
    const upcoming = await findUpcomingQuotaBookings(ctx(), clubId);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);

    const confirmed = upcoming.find((b) => b.status === "CONFIRMED")!;
    expect(
      await setQuotaBookingLabel(ctx(), clubId, confirmed.id, "U18 Training"),
    ).toBe(true);

    const relabeled = await prisma.booking.findUniqueOrThrow({
      where: { id: confirmed.id },
    });
    expect(relabeled.label).toBe("U18 Training");

    expect(
      await releaseQuotaBookingByClub(ctx(), clubId, confirmed.id),
    ).toBe(true);
    const releasedRow = await prisma.booking.findUniqueOrThrow({
      where: { id: confirmed.id },
    });
    expect(releasedRow.status).toBe("RELEASED");

    // Doppelte Freigabe ist ein No-op
    expect(
      await releaseQuotaBookingByClub(ctx(), clubId, confirmed.id),
    ).toBe(false);
  });

  it("fremder Mandant/fremder Verein kann nichts bestätigen", async () => {
    const target = await createQuotaBooking(9, 18);
    const otherOrg = await prisma.organisation.create({
      data: { name: "Fremd", slug: "org-quota-fremd" },
    });
    expect(
      await confirmQuotaBooking(
        { organisationId: otherOrg.id },
        clubId,
        target.id,
      ),
    ).toBe(false);
    expect(await confirmQuotaBooking(ctx(), "falscher-club", target.id)).toBe(
      false,
    );
  });
});
