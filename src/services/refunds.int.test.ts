import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createInvoiceForOrder } from "./invoices";
import { refundOrder } from "./refunds";
import { processStripeEvent } from "./stripe-webhooks";

// DoD Ticket 3.3: Teilerstattung erzeugt Teilgutschrift; Voll-Erstattung
// setzt REFUNDED; Refund-Webhook bestätigt; Grenzen werden validiert.

let refundCounter = 0;
vi.mock("./stripe", () => ({
  getStripe: () => ({
    refunds: {
      create: vi.fn(async () => ({ id: `re_test_${++refundCounter}` })),
    },
    charges: { retrieve: vi.fn(async () => ({})) },
  }),
}));

let orderId: string;
let actorId: string;

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR = mkdtempSync(
    path.join(tmpdir(), "dtd-refunds-"),
  );
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Ref Org", slug: "org-refunds" },
  });
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: org.id,
      name: "Refund GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "RF",
      defaultTaxRateBp: 1900,
      email: "int-test-rf-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: org.id,
      legalEntityId: legalEntity.id,
      name: "Ref Venue",
      slug: "venue-refunds",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
    },
  });
  const buyer = await prisma.user.create({
    data: { email: "int-test-rf-buyer@example.org", name: "RF Käufer" },
  });
  actorId = buyer.id;

  const order = await prisma.order.create({
    data: {
      organisationId: org.id,
      venueId: venue.id,
      userId: buyer.id,
      legalEntityId: legalEntity.id,
      number: "ORD-RF-001",
      status: "PAID",
      subtotalCents: 8403,
      taxCents: 1597,
      totalCents: 10000,
      billingSnapshot: {
        name: "RF Käufer",
        street: "Weg 1",
        zip: "51063",
        city: "Köln",
        country: "DE",
      },
      termsVersion: "v1",
      paidAt: new Date(),
      stripePaymentIntentId: "pi_rf_1",
      items: {
        create: {
          productType: "SUBSCRIPTION",
          description: "Dauerplatz Test",
          servicePeriodFrom: new Date("2026-10-01T00:00:00Z"),
          servicePeriodTo: new Date("2027-03-31T00:00:00Z"),
          quantity: 1,
          unitCents: 10000,
          taxRateBp: 1900,
          netCents: 8403,
          taxCents: 1597,
          grossCents: 10000,
        },
      },
    },
  });
  orderId = order.id;
  await prisma.payment.create({
    data: {
      orderId,
      provider: "STRIPE",
      providerRef: "pi_rf_1",
      method: "sepa_debit",
      amountCents: 10000,
      status: "SUCCEEDED",
      receivedAt: new Date(),
    },
  });
  await createInvoiceForOrder(orderId);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("refundOrder (3.3)", () => {
  it("Teilerstattung erzeugt Teilgutschrift mit Bezug zur Rechnung", async () => {
    const result = await refundOrder({
      orderId,
      amountCents: 4000,
      reason: "Kulanz",
      actorUserId: actorId,
    });

    expect(result.creditNote.type).toBe("CREDIT_NOTE");
    expect(result.creditNote.grossCents).toBe(4000);
    expect(result.creditNote.number).toMatch(/^RF-\d{4}-000002$/); // Rechnung war 000001

    const original = await prisma.invoice.findFirstOrThrow({
      where: { orderId, type: "INVOICE" },
    });
    expect(result.creditNote.relatedInvoiceId).toBe(original.id);
    // Steuer aus Brutto rückgerechnet, Summe konsistent
    expect(result.creditNote.netCents + result.creditNote.taxCents).toBe(4000);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PARTIALLY_REFUNDED");

    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId } });
    expect(refund).toMatchObject({
      amountCents: 4000,
      status: "PENDING",
      creditNoteInvoiceId: result.creditNote.id,
    });

    const mail = await prisma.emailLog.findFirst({
      where: { refId: result.creditNote.id, template: "refund" },
    });
    expect(mail).not.toBeNull();
  });

  it("Überzahlung wird abgelehnt (mehr als Restbetrag)", async () => {
    await expect(
      refundOrder({
        orderId,
        amountCents: 7000, // Rest sind nur 6000
        reason: "zu viel",
        actorUserId: actorId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });

  it("Rest-Erstattung setzt Order auf REFUNDED", async () => {
    const result = await refundOrder({
      orderId,
      reason: "Storno komplett",
      actorUserId: actorId,
    });
    expect(result.amountCents).toBe(6000);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("REFUNDED");
    expect(await prisma.invoice.count({ where: { orderId, type: "CREDIT_NOTE" } })).toBe(2);
  });

  it("charge.refunded bestätigt unsere Refunds", async () => {
    const pending = await prisma.refund.findMany({
      where: { orderId, status: "PENDING" },
    });
    expect(pending.length).toBeGreaterThan(0);

    await processStripeEvent({
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_rf_1",
          object: "charge",
          refunds: { data: pending.map((r) => ({ id: r.providerRef })) },
        },
      },
    });

    const stillPending = await prisma.refund.count({
      where: { orderId, status: "PENDING" },
    });
    expect(stillPending).toBe(0);
    expect(
      await prisma.refund.count({ where: { orderId, status: "SUCCEEDED" } }),
    ).toBe(2);
  });

  it("weitere Erstattung nach REFUNDED wird abgelehnt", async () => {
    await expect(
      refundOrder({ orderId, reason: "nochmal", actorUserId: actorId }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
