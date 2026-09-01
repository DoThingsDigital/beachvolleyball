import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { cancelBookingByCustomer } from "./booking-cancellation";
import { createInvoiceForOrder } from "./invoices";
import { sendBookingReminders } from "./reminders";

// Tickets 4.4/4.8: Kunden-Storno (Frist, Erstattungsarten) und
// idempotente Erinnerungs-Mails.

vi.mock("./stripe", () => ({
  getStripe: () => ({
    refunds: { create: vi.fn(async () => ({ id: "re_cancelcust_1" })) },
    charges: { retrieve: vi.fn(async () => ({})) },
  }),
}));

let orgId: string;
let venueId: string;
let courtId: string;
let buyerId: string;

async function makePaidBooking(params: {
  startAt: Date;
  priceCents: number;
  withInvoice?: boolean;
}) {
  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId,
      userId: buyerId,
      legalEntityId: (await prisma.venue.findUniqueOrThrow({ where: { id: venueId } }))
        .legalEntityId,
      number: `ORD-CC-${params.startAt.getTime()}`,
      status: "PAID",
      subtotalCents: params.priceCents,
      taxCents: 0,
      totalCents: params.priceCents,
      billingSnapshot: { name: "CC", street: "W 1", zip: "51063", city: "K", country: "DE" },
      termsVersion: "v1",
      paidAt: new Date(),
      stripePaymentIntentId: `pi_cc_${params.startAt.getTime()}`,
      items: {
        create: {
          productType: "SINGLE_BOOKING",
          description: "Einzelbuchung",
          servicePeriodFrom: params.startAt,
          servicePeriodTo: new Date(params.startAt.getTime() + 3_600_000),
          quantity: 1,
          unitCents: params.priceCents,
          taxRateBp: 1900,
          netCents: params.priceCents,
          taxCents: 0,
          grossCents: params.priceCents,
        },
      },
    },
    include: { items: true },
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "STRIPE",
      providerRef: order.stripePaymentIntentId!,
      method: "card",
      amountCents: params.priceCents,
      status: "SUCCEEDED",
      receivedAt: new Date(),
    },
  });
  if (params.withInvoice ?? true) {
    await createInvoiceForOrder(order.id);
  }
  const booking = await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      startAt: params.startAt,
      endAt: new Date(params.startAt.getTime() + 3_600_000),
      kind: "CUSTOMER",
      status: "CONFIRMED",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId: buyerId,
      orderItemId: order.items[0]!.id,
      priceCents: params.priceCents,
      confirmedAt: new Date(),
    },
  });
  return { orderId: order.id, bookingId: booking.id };
}

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "dtd-cc-"));
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "CC Org", slug: "org-cust-cancel" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "CC GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "CC",
      defaultTaxRateBp: 1900,
      email: "int-test-cc-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "CC Venue",
      slug: "venue-cust-cancel",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
      cancelHours: 24,
      cancelRefundMode: "MONEY",
    },
  });
  venueId = venue.id;
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld CC" },
  });
  courtId = court.id;
  const buyer = await prisma.user.create({
    data: { email: "int-test-cc-buyer@example.org", name: "CC Käufer" },
  });
  buyerId = buyer.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cancelBookingByCustomer (4.4, D6/I2)", () => {
  it("MONEY: Storno in der Frist erstattet und erzeugt Gutschrift", async () => {
    const { orderId, bookingId } = await makePaidBooking({
      startAt: new Date(Date.now() + 3 * 86_400_000),
      priceCents: 3000,
    });

    const result = await cancelBookingByCustomer(
      { organisationId: orgId },
      { bookingId, userId: buyerId },
    );
    expect(result).toMatchObject({ refundMode: "MONEY", amountCents: 3000 });
    expect(result.creditNoteNumber).toMatch(/^CC-/);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledByUserId).toBe(buyerId);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("REFUNDED"); // voller Betrag erstattet

    const mail = await prisma.emailLog.findFirst({
      where: { refType: "booking", refId: bookingId, template: "booking-cancelled" },
    });
    expect(mail).not.toBeNull();
  });

  it("Frist abgelaufen → CANCEL_DEADLINE_PASSED, Buchung bleibt", async () => {
    const { bookingId } = await makePaidBooking({
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // in 2 h, Frist 24 h
      priceCents: 3000,
    });
    await expect(
      cancelBookingByCustomer(
        { organisationId: orgId },
        { bookingId, userId: buyerId },
      ),
    ).rejects.toMatchObject({ code: "CANCEL_DEADLINE_PASSED" });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("CONFIRMED");
  });

  it("CREDIT: Storno erzeugt Guthaben statt Erstattung", async () => {
    await prisma.venue.update({
      where: { id: venueId },
      data: { cancelRefundMode: "CREDIT" },
    });
    const { orderId, bookingId } = await makePaidBooking({
      startAt: new Date(Date.now() + 3 * 86_400_000),
      priceCents: 2500,
    });

    const result = await cancelBookingByCustomer(
      { organisationId: orgId },
      { bookingId, userId: buyerId },
    );
    expect(result).toMatchObject({ refundMode: "CREDIT", amountCents: 2500 });

    const credit = await prisma.creditLedger.findFirst({
      where: { userId: buyerId, refId: bookingId },
    });
    expect(credit?.deltaCents).toBe(2500);

    // Geldseitig passiert nichts
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAID");
    expect(await prisma.refund.count({ where: { orderId } })).toBe(0);
  });

  it("fremde Buchung ist nicht stornierbar", async () => {
    const stranger = await prisma.user.create({
      data: { email: "int-test-cc-stranger@example.org" },
    });
    const { bookingId } = await makePaidBooking({
      startAt: new Date(Date.now() + 3 * 86_400_000),
      priceCents: 1000,
    });
    await expect(
      cancelBookingByCustomer(
        { organisationId: orgId },
        { bookingId, userId: stranger.id },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("sendBookingReminders (4.8, J2)", () => {
  it("erinnert einmal, zweiter Lauf ist ein No-op", async () => {
    const { bookingId } = await makePaidBooking({
      startAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
      priceCents: 3000,
      withInvoice: false,
    });

    const first = await sendBookingReminders();
    expect(first.candidates).toBeGreaterThanOrEqual(1);

    const log = await prisma.emailLog.findFirst({
      where: { refType: "booking-reminder", refId: bookingId },
    });
    expect(log).not.toBeNull();

    const second = await sendBookingReminders();
    expect(second.candidates).toBe(0);
  });
});
