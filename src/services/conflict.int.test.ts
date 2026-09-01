import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createSingleBookingOrder } from "./single-booking";

// Ticket 4.5 (D4): 20 parallele Buchungen auf denselben Slot –
// genau eine gewinnt, der Rest scheitert mit SLOT_TAKEN.

let orgId: string;
let venueId: string;
let courtId: string;
let userIds: string[] = [];

function testDate(): string {
  return new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Conf Org", slug: "org-conflict" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Conf GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "CF",
      defaultTaxRateBp: 1900,
      email: "int-test-conf-le@example.org",
    },
  });
  const opening = { from: "08:00", to: "22:00" } as const;
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Conf Venue",
      slug: "venue-conflict",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {
        mon: [[opening.from, opening.to]],
        tue: [[opening.from, opening.to]],
        wed: [[opening.from, opening.to]],
        thu: [[opening.from, opening.to]],
        fri: [[opening.from, opening.to]],
        sat: [[opening.from, opening.to]],
        sun: [[opening.from, opening.to]],
      },
    },
  });
  venueId = venue.id;
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld X" },
  });
  courtId = court.id;
  await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Conf Season",
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 60 * 86_400_000),
      status: "ACTIVE",
    },
  });
  const season = await prisma.season.findFirstOrThrow({ where: { venueId } });
  await prisma.priceRule.create({
    data: {
      organisationId: orgId,
      venueId,
      seasonId: season.id,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timeFrom: "08:00",
      timeTo: "22:00",
      pricePerHourCents: 3000,
      priority: 10,
      label: "Standard",
    },
  });

  userIds = [];
  for (let i = 0; i < 20; i++) {
    const user = await prisma.user.create({
      data: {
        email: `int-test-conf-${i}@example.org`,
        name: `Käufer ${i}`,
        billingStreet: "Weg 1",
        billingZip: "51063",
        billingCity: "Köln",
        billingCountry: "DE",
      },
    });
    userIds.push(user.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Konfliktschutz (4.5, D4)", () => {
  it("20 parallele Buchungen auf denselben Slot: genau eine gewinnt", async () => {
    const date = testDate();
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        createSingleBookingOrder(
          { organisationId: orgId },
          { userId, venueId, courtId, date, time: "10:00", durationMin: 60 },
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    expect(
      rejected.every(
        (r) => (r.reason as { code?: string }).code === "SLOT_TAKEN",
      ),
    ).toBe(true);

    const bookings = await prisma.booking.count({
      where: { courtId, status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] } },
    });
    expect(bookings).toBe(1);

    // und genau eine Bestellung blieb übrig
    expect(await prisma.order.count({ where: { venueId } })).toBe(1);
  }, 60_000);
});
