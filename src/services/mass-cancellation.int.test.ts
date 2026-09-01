import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createInvoiceForOrder } from "./invoices";
import {
  executeMassCancellation,
  previewMassCancellation,
} from "./mass-cancellation";

// Ticket 5.6 (I3): Massenstorno für Zeitraum mit Erstattung/Guthaben und
// EINER Sammelmail je Kunde; unbezahlte Holds nur storniert.

vi.mock("./stripe", () => ({
  getStripe: () => ({
    refunds: {
      create: vi.fn(async () => ({ id: `re_mass_${Math.random().toString(36).slice(2, 8)}` })),
    },
    charges: { retrieve: vi.fn(async () => ({})) },
  }),
}));

const TZ = "Europe/Berlin";

let orgId: string;
let venueId: string;
let courtId: string;
let staffId: string;

const ctx = () => ({ organisationId: orgId });

// Fester Ausfalltag weit in der Zukunft, lokal datumsstabil
const OUTAGE_DATE = "2027-02-10";

async function makeUser(email: string) {
  return prisma.user.create({
    data: {
      email,
      name: email.split("@")[0],
      billingStreet: "Weg 9",
      billingZip: "50667",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
}

async function makePaidBooking(params: {
  userId: string;
  hour: number;
  priceCents: number;
  paid?: boolean;
  withInvoice?: boolean;
}) {
  const startAt = new Date(`${OUTAGE_DATE}T${String(params.hour).padStart(2, "0")}:00:00+01:00`);
  const endAt = new Date(startAt.getTime() + 3_600_000);
  const paid = params.paid ?? true;

  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId,
      userId: params.userId,
      legalEntityId: (
        await prisma.venue.findUniqueOrThrow({ where: { id: venueId } })
      ).legalEntityId,
      number: `ORD-MC-${params.userId.slice(-4)}-${params.hour}`,
      status: paid ? "PAID" : "AWAITING_PAYMENT",
      subtotalCents: params.priceCents,
      taxCents: 0,
      totalCents: params.priceCents,
      billingSnapshot: { name: "MC", street: "W 1", zip: "51063", city: "K", country: "DE" },
      termsVersion: "v1",
      ...(paid
        ? { paidAt: new Date(), stripePaymentIntentId: `pi_mc_${params.userId.slice(-4)}_${params.hour}` }
        : {}),
      items: {
        create: {
          productType: "SINGLE_BOOKING",
          description: "Einzelbuchung",
          servicePeriodFrom: startAt,
          servicePeriodTo: endAt,
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
  if (paid) {
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
    if (params.withInvoice ?? true) await createInvoiceForOrder(order.id);
  }
  const booking = await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      startAt,
      endAt,
      kind: "CUSTOMER",
      status: paid ? "CONFIRMED" : "HOLD",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId: params.userId,
      orderItemId: order.items[0]!.id,
      priceCents: params.priceCents,
      ...(paid
        ? { confirmedAt: new Date() }
        : { holdExpiresAt: new Date(Date.now() + 15 * 60_000) }),
    },
  });
  return { orderId: order.id, bookingId: booking.id };
}

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), "dtd-mc-"));
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "MC Org", slug: "org-mass-cancel" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "MC GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "MC",
      defaultTaxRateBp: 1900,
      email: "int-test-mc-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "MC Venue",
      slug: "venue-mass-cancel",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      openingHours: {},
    },
  });
  venueId = venue.id;
  courtId = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld MC" },
    })
  ).id;
  staffId = (
    await prisma.user.create({ data: { email: "int-test-mc-staff@example.org" } })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Massenstorno (5.6, I3)", () => {
  it("Vorschau zählt Betroffene und bezahltes Volumen", async () => {
    const anna = await makeUser("int-test-mc-anna@example.org");
    const ben = await makeUser("int-test-mc-ben@example.org");
    await makePaidBooking({ userId: anna.id, hour: 10, priceCents: 3000 });
    await makePaidBooking({ userId: anna.id, hour: 12, priceCents: 2600 });
    await makePaidBooking({ userId: ben.id, hour: 14, priceCents: 3000 });
    await makePaidBooking({
      userId: ben.id,
      hour: 16,
      priceCents: 3000,
      paid: false, // HOLD ohne Zahlung
    });

    const preview = await previewMassCancellation(ctx(), {
      venueId,
      dateFrom: OUTAGE_DATE,
      dateTo: OUTAGE_DATE,
    });
    expect(preview).toMatchObject({
      affected: 4,
      customers: 2,
      paidCents: 3000 + 2600 + 3000,
    });
  });

  it("MONEY: storniert alles, erstattet Bezahltes, eine Sammelmail je Kunde", async () => {
    const result = await executeMassCancellation(
      ctx(),
      {
        venueId,
        dateFrom: OUTAGE_DATE,
        dateTo: OUTAGE_DATE,
        reason: "Sturmschaden Traglufthalle",
        refundMode: "MONEY",
      },
      staffId,
    );

    expect(result.cancelled).toBe(4);
    expect(result.refundedCents).toBe(8600);
    expect(result.creditedCents).toBe(0);
    // emailsSent zählt erfolgreiche Zustellungen – im Test schlägt der
    // echte Versand fehl (Resend-Testmodus), das EmailLog belegt die
    // EINE Sammelmail je Kunde

    const bookings = await prisma.booking.findMany({
      where: { venueId, startAt: { gte: new Date(`${OUTAGE_DATE}T00:00:00Z`) } },
    });
    expect(bookings.every((b) => b.status === "CANCELLED")).toBe(true);
    expect(
      bookings.every((b) => b.cancelReason?.startsWith("HALLENAUSFALL")),
    ).toBe(true);

    // Gutschriften existieren für die drei bezahlten Buchungen
    const creditNotes = await prisma.invoice.count({
      where: { type: "CREDIT_NOTE" },
    });
    expect(creditNotes).toBe(3);

    const mails = await prisma.emailLog.findMany({
      where: { template: "mass-cancellation" },
    });
    expect(mails).toHaveLength(2);
    expect(new Set(mails.map((m) => m.to)).size).toBe(2);

    // Idempotent: zweiter Lauf findet nichts mehr, keine weiteren Mails
    const again = await executeMassCancellation(
      ctx(),
      {
        venueId,
        dateFrom: OUTAGE_DATE,
        dateTo: OUTAGE_DATE,
        reason: "Sturmschaden Traglufthalle",
        refundMode: "MONEY",
      },
      staffId,
    );
    expect(again.cancelled).toBe(0);
    expect(
      await prisma.emailLog.count({ where: { template: "mass-cancellation" } }),
    ).toBe(2);
  });

  it("CREDIT: schreibt Guthaben statt Geld gut", async () => {
    const clara = await makeUser("int-test-mc-clara@example.org");
    const { bookingId } = await makePaidBooking({
      userId: clara.id,
      hour: 18,
      priceCents: 3400,
    });

    const result = await executeMassCancellation(
      ctx(),
      {
        venueId,
        dateFrom: OUTAGE_DATE,
        dateTo: OUTAGE_DATE,
        reason: "Nachbeben",
        refundMode: "CREDIT",
      },
      staffId,
    );
    expect(result.cancelled).toBe(1);
    expect(result.creditedCents).toBe(3400);
    expect(result.refundedCents).toBe(0);

    const credit = await prisma.creditLedger.findFirst({
      where: { userId: clara.id, refId: bookingId },
    });
    expect(credit?.deltaCents).toBe(3400);
  });
});
