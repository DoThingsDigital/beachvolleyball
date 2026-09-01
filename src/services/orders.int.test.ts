import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createSubscriptionOrder, expireHolds } from "./orders";

// Integrationstests (Test-DB) für Ticket 2.3: transaktionale Order-Erstellung
// mit HOLD-Materialisierung, Doppelverkaufsschutz, idempotenter Hold-Cleanup.

let orgId: string;
let venueId: string;
let seasonId: string;
let courtId: string;
let buyerId: string;
let buyer2Id: string;

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Order Org", slug: "org-orders" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "LE Orders",
      legalForm: "GmbH",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "OR",
      defaultTaxRateBp: 1900,
      email: "int-test-orders-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Order Venue",
      slug: "venue-orders",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      openingHours: { thu: [["17:00", "22:00"]] },
      closedDates: [],
    },
  });
  venueId = venue.id;

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Order Season",
      startDate: new Date("2026-10-01T00:00:00+02:00"),
      endDate: new Date("2026-11-01T00:00:00+01:00"),
      status: "PRESALE",
      subscriptionDiscountBp: 1000,
    },
  });
  seasonId = season.id;

  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld O" },
  });
  courtId = court.id;

  await prisma.priceRule.create({
    data: {
      organisationId: orgId,
      venueId,
      seasonId,
      weekdays: [4],
      timeFrom: "17:00",
      timeTo: "22:00",
      pricePerHourCents: 3000,
      priority: 10,
      label: "Do-Abend",
    },
  });

  const buyer = await prisma.user.create({
    data: {
      email: "int-test-buyer@example.org",
      name: "Käufer Eins",
      billingStreet: "Rechnungsweg 1",
      billingZip: "51063",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  buyerId = buyer.id;
  const buyer2 = await prisma.user.create({
    data: {
      email: "int-test-buyer2@example.org",
      name: "Käufer Zwei",
      billingStreet: "Rechnungsweg 2",
      billingZip: "51063",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  buyer2Id = buyer2.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const selection = {
  weekday: 4,
  startTime: "19:00",
  durationMin: 60,
} as const;

describe("createSubscriptionOrder", () => {
  it("legt Order, OrderItem, PENDING-Subscription und HOLD-Bookings an", async () => {
    const result = await createSubscriptionOrder(
      { organisationId: orgId },
      { userId: buyerId, venueId, seasonId, courtId, ...selection },
    );
    expect(result.orderNumber).toMatch(/^ORD-/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { items: true },
    });
    expect(order.status).toBe("AWAITING_PAYMENT");
    // Oktober 2026 hat 5 Donnerstage à 30 €, 10 % Rabatt → 135,00 €
    expect(order.totalCents).toBe(13500);
    expect(order.subtotalCents + order.taxCents).toBe(order.totalCents);
    expect(order.items).toHaveLength(1);

    const sub = await prisma.subscription.findFirstOrThrow({
      where: { orderItemId: order.items[0]!.id },
    });
    expect(sub.status).toBe("PENDING");

    const bookings = await prisma.booking.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { startAt: "asc" },
    });
    expect(bookings).toHaveLength(5);
    expect(bookings.every((b) => b.status === "HOLD")).toBe(true);
    expect(bookings.every((b) => b.holdExpiresAt !== null)).toBe(true);
    // Rundungsrest auf letztem Termin: 4×2700 + 2700 = 13500
    const sum = bookings.reduce((a, b) => a + (b.priceCents ?? 0), 0);
    expect(sum).toBe(13500);
  });

  it("Doppelverkauf desselben Slots → SLOT_TAKEN, nichts bleibt zurück", async () => {
    const ordersBefore = await prisma.order.count();
    const bookingsBefore = await prisma.booking.count();

    await expect(
      createSubscriptionOrder(
        { organisationId: orgId },
        { userId: buyer2Id, venueId, seasonId, courtId, ...selection },
      ),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });

    // Rollback: keine neue Order, keine neuen Bookings
    expect(await prisma.order.count()).toBe(ordersBefore);
    expect(await prisma.booking.count()).toBe(bookingsBefore);
  });

  it("ohne Rechnungsadresse → BILLING_ADDRESS_REQUIRED (A2)", async () => {
    const noAddress = await prisma.user.create({
      data: { email: "int-test-noaddr@example.org", name: "Ohne Adresse" },
    });
    await expect(
      createSubscriptionOrder(
        { organisationId: orgId },
        {
          userId: noAddress.id,
          venueId,
          seasonId,
          courtId,
          weekday: 4,
          startTime: "17:00",
          durationMin: 60,
        },
      ),
    ).rejects.toMatchObject({ code: "BILLING_ADDRESS_REQUIRED" });
  });
});

describe("expireHolds (idempotent, NF5)", () => {
  it("läuft Holds ab, storniert Subscription + Order; zweiter Lauf ist No-op", async () => {
    // Holds künstlich ablaufen lassen
    await prisma.booking.updateMany({
      where: { status: "HOLD" },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const first = await expireHolds();
    expect(first.expiredBookings).toBe(5);
    expect(first.cancelledSubscriptions).toBe(1);
    expect(first.cancelledOrders).toBe(1);

    const second = await expireHolds();
    expect(second).toEqual({
      expiredBookings: 0,
      cancelledSubscriptions: 0,
      cancelledOrders: 0,
    });

    // Slot ist wieder frei: Käufer 2 kann jetzt kaufen
    await expect(
      createSubscriptionOrder(
        { organisationId: orgId },
        { userId: buyer2Id, venueId, seasonId, courtId, ...selection },
      ),
    ).resolves.toMatchObject({ orderId: expect.any(String) });
  });
});
