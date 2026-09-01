import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { getCreditBalance } from "@/src/db/credit";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { payOrderWithCredit } from "./credit-payment";

// Ticket M1 (S3): Guthaben-Verrechnung im Checkout – Vollverrechnung,
// Erfüllung wie beim Stripe-Weg, atomar gegen Doppel-Einlösung.

let orgId: string;
let venueId: string;
let courtId: string;
let userId: string;
let legalEntityId: string;

const ctx = () => ({ organisationId: orgId });

let orderSeq = 0;

async function makeOpenOrder(params: { totalCents: number; hour: number }) {
  orderSeq += 1;
  const startAt = new Date(Date.now() + params.hour * 3_600_000);
  const endAt = new Date(startAt.getTime() + 3_600_000);
  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId,
      userId,
      legalEntityId,
      number: `ORD-CR-${orderSeq}`,
      status: "AWAITING_PAYMENT",
      subtotalCents: params.totalCents,
      taxCents: 0,
      totalCents: params.totalCents,
      billingSnapshot: { name: "CR", street: "W 1", zip: "51063", city: "K", country: "DE" },
      termsVersion: "v1",
      items: {
        create: {
          productType: "SINGLE_BOOKING",
          description: "Einzelbuchung",
          servicePeriodFrom: startAt,
          servicePeriodTo: endAt,
          quantity: 1,
          unitCents: params.totalCents,
          taxRateBp: 1900,
          netCents: params.totalCents,
          taxCents: 0,
          grossCents: params.totalCents,
        },
      },
    },
    include: { items: true },
  });
  const booking = await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      startAt,
      endAt,
      kind: "CUSTOMER",
      status: "HOLD",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId,
      orderItemId: order.items[0]!.id,
      priceCents: params.totalCents,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  return { orderId: order.id, bookingId: booking.id };
}

async function addCredit(deltaCents: number) {
  await prisma.creditLedger.create({
    data: {
      organisationId: orgId,
      userId,
      deltaCents,
      reason: "Test-Gutschrift",
    },
  });
}

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), "dtd-cr-"));
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "CR Org", slug: "org-credit-pay" },
  });
  orgId = org.id;
  legalEntityId = (
    await prisma.legalEntity.create({
      data: {
        organisationId: orgId,
        name: "CR GmbH",
        legalForm: "GmbH",
        street: "Weg 1",
        zip: "50667",
        city: "Köln",
        invoicePrefix: "CR",
        defaultTaxRateBp: 1900,
        email: "int-test-cr-le@example.org",
      },
    })
  ).id;
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId,
      name: "CR Venue",
      slug: "venue-credit-pay",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
    },
  });
  venueId = venue.id;
  courtId = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld CR" },
    })
  ).id;
  userId = (
    await prisma.user.create({
      data: { email: "int-test-cr-kunde@example.org", name: "CR Kunde" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("payOrderWithCredit (M1)", () => {
  it("unzureichendes Guthaben wird abgelehnt, nichts verändert", async () => {
    await addCredit(1000);
    const { orderId, bookingId } = await makeOpenOrder({
      totalCents: 3000,
      hour: 24,
    });
    await expect(
      payOrderWithCredit(ctx(), { orderId, userId }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDIT" });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_PAYMENT");
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("HOLD");
    expect(await getCreditBalance(ctx(), userId)).toBe(1000);
  });

  it("volle Deckung: bezahlt, erfüllt, Rechnung, Ledger-Abbuchung", async () => {
    await addCredit(2500); // gesamt 3500
    const { orderId, bookingId } = await makeOpenOrder({
      totalCents: 3000,
      hour: 26,
    });
    const result = await payOrderWithCredit(ctx(), { orderId, userId });
    expect(result.remainingCents).toBe(500);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(order.status).toBe("PAID");
    expect(order.paymentMethodType).toBe("credit");
    expect(order.payments[0]).toMatchObject({
      provider: "MANUAL",
      method: "credit",
      status: "SUCCEEDED",
      amountCents: 3000,
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("CONFIRMED");

    expect(await getCreditBalance(ctx(), userId)).toBe(500);
    const spend = await prisma.creditLedger.findFirst({
      where: { userId, refType: "order", refId: orderId },
    });
    expect(spend?.deltaCents).toBe(-3000);

    const invoice = await prisma.invoice.findFirst({ where: { orderId } });
    expect(invoice?.grossCents).toBe(3000);

    // Doppelt zahlen geht nicht (Order nicht mehr offen)
    await expect(
      payOrderWithCredit(ctx(), { orderId, userId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("parallele Einlösung: genau eine Bestellung gewinnt", async () => {
    // Restguthaben 500 + 3000 = 3500; zwei offene Bestellungen à 3500
    await addCredit(3000);
    const a = await makeOpenOrder({ totalCents: 3500, hour: 30 });
    const b = await makeOpenOrder({ totalCents: 3500, hour: 32 });

    const results = await Promise.allSettled([
      payOrderWithCredit(ctx(), { orderId: a.orderId, userId }),
      payOrderWithCredit(ctx(), { orderId: b.orderId, userId }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await getCreditBalance(ctx(), userId)).toBe(0);
  });

  it("abgelaufenes Guthaben zählt nicht", async () => {
    await prisma.creditLedger.create({
      data: {
        organisationId: orgId,
        userId,
        deltaCents: 9999,
        reason: "abgelaufen",
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });
    expect(await getCreditBalance(ctx(), userId)).toBe(0);
  });

  it("fremder Mandant/fremde Bestellung: NOT_FOUND", async () => {
    await addCredit(5000);
    const { orderId } = await makeOpenOrder({ totalCents: 1000, hour: 40 });
    const other = await prisma.organisation.create({
      data: { name: "Fremd", slug: "org-credit-fremd" },
    });
    await expect(
      payOrderWithCredit({ organisationId: other.id }, { orderId, userId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
