import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createSubscriptionOrder, expireHolds } from "./orders";
import { processStripeEvent } from "./stripe-webhooks";

// Stripe-API im Test mocken: Refunds/Charge-Reads gehen nicht raus.
vi.mock("./stripe", () => ({
  getStripe: () => ({
    refunds: {
      create: vi.fn(async () => ({ id: "re_test_conflict" })),
    },
    charges: { retrieve: vi.fn(async () => ({})) },
  }),
}));

// Integrationstests (Ticket 2.5): Statusübergänge über Stripe-Fixture-Events
// in beliebiger Reihenfolge, Idempotenz, SEPA-Rücklastschrift (G3/G4).

let orgId: string;
let venueId: string;
let seasonId: string;
let courtId: string;
let buyerId: string;

async function makeOrder(startTime: string) {
  const result = await createSubscriptionOrder(
    { organisationId: orgId },
    {
      userId: buyerId,
      venueId,
      seasonId,
      courtId,
      weekday: 4,
      startTime,
      durationMin: 60,
    },
  );
  return result.orderId;
}

function piEvent(
  type:
    | "payment_intent.processing"
    | "payment_intent.succeeded"
    | "payment_intent.payment_failed",
  orderId: string,
  piId: string,
) {
  return {
    type,
    data: {
      object: {
        id: piId,
        object: "payment_intent",
        amount: 13500,
        metadata: { orderId },
        payment_method_types: ["sepa_debit"],
        latest_charge: null,
        payment_method: "pm_test",
        last_payment_error: null,
      },
    },
  };
}

async function orderState(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  const itemIds = order.items.map((i) => i.id);
  const sub = await prisma.subscription.findFirst({
    where: { orderItemId: { in: itemIds } },
  });
  const bookingStatuses = await prisma.booking.groupBy({
    by: ["status"],
    where: { orderItemId: { in: itemIds } },
    _count: true,
  });
  return {
    order: order.status,
    sub: sub?.status,
    bookings: Object.fromEntries(
      bookingStatuses.map((b) => [b.status, b._count]),
    ),
  };
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: {
      name: "WH Org",
      slug: "org-webhooks",
      settings: { confirmOnProcessing: true },
    },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "LE WH",
      legalForm: "GmbH",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "WH",
      defaultTaxRateBp: 1900,
      email: "int-test-wh-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "WH Venue",
      slug: "venue-webhooks",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      openingHours: { thu: [["08:00", "22:00"]] },
      closedDates: [],
    },
  });
  venueId = venue.id;
  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "WH Season",
      startDate: new Date("2026-10-01T00:00:00+02:00"),
      endDate: new Date("2026-11-01T00:00:00+01:00"),
      status: "PRESALE",
    },
  });
  seasonId = season.id;
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld WH" },
  });
  courtId = court.id;
  await prisma.priceRule.create({
    data: {
      organisationId: orgId,
      venueId,
      seasonId,
      weekdays: [4],
      timeFrom: "08:00",
      timeTo: "22:00",
      pricePerHourCents: 3000,
      priority: 10,
      label: "Standard",
    },
  });
  const buyer = await prisma.user.create({
    data: {
      email: "int-test-wh-buyer@example.org",
      name: "WH Käufer",
      billingStreet: "Weg 1",
      billingZip: "51063",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  buyerId = buyer.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("SEPA-Pfad in normaler Reihenfolge", () => {
  it("processing bestätigt (confirmOnProcessing), succeeded setzt PAID", async () => {
    const orderId = await makeOrder("08:00");

    await processStripeEvent(piEvent("payment_intent.processing", orderId, "pi_a"));
    expect(await orderState(orderId)).toMatchObject({
      order: "PROCESSING",
      sub: "ACTIVE",
      bookings: { CONFIRMED: 5 },
    });

    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_a"));
    expect(await orderState(orderId)).toMatchObject({
      order: "PAID",
      sub: "ACTIVE",
      bookings: { CONFIRMED: 5 },
    });

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId, providerRef: "pi_a" },
    });
    expect(payment.status).toBe("SUCCEEDED");

    // Ticket 3.2: Rechnung wurde automatisch erzeugt und verschickt
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { orderId, type: "INVOICE" },
    });
    expect(invoice.number).toMatch(/^WH-\d{4}-\d{6}$/);
    // Saison ohne Rabatt: 5 Termine à 30,00 €
    expect(invoice.grossCents).toBe(15000);
    const invoiceMail = await prisma.emailLog.findFirst({
      where: { refId: invoice.id, template: "invoice" },
    });
    expect(invoiceMail).not.toBeNull();

    // Doppeltes succeeded-Event erzeugt keine zweite Rechnung
    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_a"));
    expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
  });

  it("doppeltes/verspätetes processing-Event ist ein No-op", async () => {
    const orderId = await makeOrder("09:00");
    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_b"));
    // verspätetes processing nach succeeded
    await processStripeEvent(piEvent("payment_intent.processing", orderId, "pi_b"));

    const state = await orderState(orderId);
    expect(state.order).toBe("PAID");
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId, providerRef: "pi_b" },
    });
    expect(payment.status).toBe("SUCCEEDED");
  });
});

describe("Reihenfolge-Unabhängigkeit", () => {
  it("succeeded ohne vorheriges processing (Kartenzahlung)", async () => {
    const orderId = await makeOrder("10:00");
    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_c"));
    expect(await orderState(orderId)).toMatchObject({
      order: "PAID",
      sub: "ACTIVE",
      bookings: { CONFIRMED: 5 },
    });
  });
});

describe("Konfliktfall: Hold abgelaufen, Session bezahlt (G6, Ticket 2.7)", () => {
  it("Auto-Refund + Konflikt-Mail, Bestellung bleibt storniert; idempotent", async () => {
    const orderId = await makeOrder("14:00");

    // Hold ablaufen lassen und Cron laufen lassen → Order CANCELLED
    await prisma.booking.updateMany({
      where: { status: "HOLD" },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await expireHolds();
    const cancelled = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(cancelled.status).toBe("CANCELLED");

    // Kunde zahlt trotzdem (Session lebt länger als der Hold)
    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_x"));

    const state = await orderState(orderId);
    expect(state.order).toBe("CANCELLED"); // keine nachträgliche Erfüllung
    expect(state.bookings).toEqual({ EXPIRED: 5 });

    const refunds = await prisma.refund.findMany({ where: { orderId } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      reason: "CHECKOUT_CONFLICT",
      status: "PENDING",
      providerRef: "re_test_conflict",
      amountCents: 13500,
    });

    const mail = await prisma.emailLog.findFirst({
      where: { refId: orderId, template: "checkout-conflict" },
    });
    expect(mail).not.toBeNull();

    // dasselbe Event nochmal → kein zweiter Refund
    await processStripeEvent(piEvent("payment_intent.succeeded", orderId, "pi_x"));
    expect(await prisma.refund.count({ where: { orderId } })).toBe(1);
  });
});

describe("SEPA-Rücklastschrift (G3)", () => {
  it("failed nach processing: Order FAILED, Buchungen storniert, User gesperrt", async () => {
    const orderId = await makeOrder("11:00");
    await processStripeEvent(piEvent("payment_intent.processing", orderId, "pi_d"));
    await processStripeEvent(
      piEvent("payment_intent.payment_failed", orderId, "pi_d"),
    );

    expect(await orderState(orderId)).toMatchObject({
      order: "FAILED",
      sub: "CANCELLED",
      bookings: { CANCELLED: 5 },
    });
    const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyer.sepaBlocked).toBe(true);

    // Slot ist wieder frei (Exclusion ignoriert CANCELLED)
    await expect(makeOrder("11:00")).resolves.toBeTruthy();
  });

  it("failed vor Bestätigung: Order CANCELLED, keine SEPA-Sperre nötig", async () => {
    // frischer Nutzer, damit die Sperre aus dem vorigen Test nicht stört
    const user2 = await prisma.user.create({
      data: {
        email: "int-test-wh-buyer2@example.org",
        name: "WH Käufer 2",
        billingStreet: "Weg 2",
        billingZip: "51063",
        billingCity: "Köln",
        billingCountry: "DE",
      },
    });
    const result = await createSubscriptionOrder(
      { organisationId: orgId },
      {
        userId: user2.id,
        venueId,
        seasonId,
        courtId,
        weekday: 4,
        startTime: "12:00",
        durationMin: 60,
      },
    );
    await processStripeEvent(
      piEvent("payment_intent.payment_failed", result.orderId, "pi_e"),
    );

    expect(await orderState(result.orderId)).toMatchObject({
      order: "CANCELLED",
      sub: "CANCELLED",
      bookings: { CANCELLED: 5 },
    });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user2.id } });
    expect(fresh.sepaBlocked).toBe(false);
  });
});
