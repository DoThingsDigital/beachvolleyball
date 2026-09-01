import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createInvoiceForOrder } from "./invoices";
import { cancelSubscription } from "./subscriptions";

// DoD Ticket 3.5 (F4): Kündigung storniert nur zukünftige Termine und
// erstattet anteilig (Summe der Termin-Preise inkl. Rundungsrest).

vi.mock("./stripe", () => ({
  getStripe: () => ({
    refunds: { create: vi.fn(async () => ({ id: "re_cancel_1" })) },
    charges: { retrieve: vi.fn(async () => ({})) },
  }),
}));

let orgId: string;
let subscriptionId: string;
let orderId: string;
let actorId: string;

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR = mkdtempSync(
    path.join(tmpdir(), "dtd-cancel-"),
  );
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Cxl Org", slug: "org-cancel" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Cxl GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "CX",
      defaultTaxRateBp: 1900,
      email: "int-test-cxl-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Cxl Venue",
      slug: "venue-cancel",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
    },
  });
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId: venue.id, name: "Feld C" },
  });
  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId: venue.id,
      name: "Cxl Season",
      startDate: new Date("2026-10-01T00:00:00+02:00"),
      endDate: new Date("2027-04-01T00:00:00+02:00"),
      status: "ACTIVE",
    },
  });
  const buyer = await prisma.user.create({
    data: {
      email: "int-test-cxl-buyer@example.org",
      name: "Cxl Käufer",
      billingStreet: "Weg 1",
      billingZip: "51063",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  actorId = buyer.id;

  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId: venue.id,
      userId: buyer.id,
      legalEntityId: legalEntity.id,
      number: "ORD-CXL-001",
      status: "PAID",
      subtotalCents: 11345,
      taxCents: 2155,
      totalCents: 13500,
      billingSnapshot: {
        name: "Cxl Käufer",
        street: "Weg 1",
        zip: "51063",
        city: "Köln",
        country: "DE",
      },
      termsVersion: "v1",
      paidAt: new Date(),
      stripePaymentIntentId: "pi_cxl_1",
      items: {
        create: {
          productType: "SUBSCRIPTION",
          description: "Dauerplatz Feld C",
          servicePeriodFrom: season.startDate,
          servicePeriodTo: season.endDate,
          quantity: 1,
          unitCents: 13500,
          taxRateBp: 1900,
          netCents: 11345,
          taxCents: 2155,
          grossCents: 13500,
        },
      },
    },
    include: { items: true },
  });
  orderId = order.id;
  await prisma.payment.create({
    data: {
      orderId,
      provider: "STRIPE",
      providerRef: "pi_cxl_1",
      method: "sepa_debit",
      amountCents: 13500,
      status: "SUCCEEDED",
      receivedAt: new Date(),
    },
  });
  await createInvoiceForOrder(orderId);

  const sub = await prisma.subscription.create({
    data: {
      organisationId: orgId,
      venueId: venue.id,
      userId: buyer.id,
      seasonId: season.id,
      courtId: court.id,
      weekday: 4,
      startTime: "19:00",
      durationMin: 60,
      dateFrom: season.startDate,
      dateTo: season.endDate,
      pricePerOccurrenceCents: 2700,
      totalCents: 13500,
      status: "ACTIVE",
      orderItemId: order.items[0]!.id,
    },
  });
  subscriptionId = sub.id;

  // 2 vergangene + 3 zukünftige Termine (letzter trägt Rundungsrest 2704)
  const now = Date.now();
  const prices = [2700, 2700, 2700, 2696, 2704];
  const dates = [
    new Date(now - 14 * 86_400_000),
    new Date(now - 7 * 86_400_000),
    new Date(now + 7 * 86_400_000),
    new Date(now + 14 * 86_400_000),
    new Date(now + 21 * 86_400_000),
  ];
  for (let i = 0; i < 5; i++) {
    await prisma.booking.create({
      data: {
        organisationId: orgId,
        venueId: venue.id,
        courtId: court.id,
        startAt: dates[i]!,
        endAt: new Date(dates[i]!.getTime() + 3_600_000),
        kind: "SUBSCRIPTION",
        status: "CONFIRMED",
        usageType: "KOMMERZIELL",
        source: "ONLINE",
        userId: buyer.id,
        subscriptionId,
        orderItemId: order.items[0]!.id,
        priceCents: prices[i]!,
        confirmedAt: new Date(),
      },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cancelSubscription (3.5, F4)", () => {
  it("storniert nur zukünftige Termine und erstattet deren Summe", async () => {
    const result = await cancelSubscription(
      { organisationId: orgId },
      {
        subscriptionId,
        reason: "Umzug",
        actorUserId: actorId,
      },
    );

    expect(result.cancelledCount).toBe(3);
    // 2700 + 2696 + 2704 = 8100 (Rundungsrest exakt berücksichtigt)
    expect(result.refundCents).toBe(8100);
    expect(result.creditNoteNumber).toMatch(/^CX-/);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe("CANCELLED");

    const bookings = await prisma.booking.groupBy({
      by: ["status"],
      where: { subscriptionId },
      _count: true,
    });
    expect(Object.fromEntries(bookings.map((b) => [b.status, b._count]))).toEqual(
      { CONFIRMED: 2, CANCELLED: 3 },
    );

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PARTIALLY_REFUNDED");

    const creditNote = await prisma.invoice.findFirstOrThrow({
      where: { orderId, type: "CREDIT_NOTE" },
    });
    expect(creditNote.grossCents).toBe(8100);
  });

  it("doppelte Kündigung wird abgelehnt", async () => {
    await expect(
      cancelSubscription(
        { organisationId: orgId },
        { subscriptionId, reason: "nochmal", actorUserId: actorId },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
