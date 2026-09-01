import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createInvoiceForOrder } from "./invoices";
import { readInvoicePdf, sha256 } from "./storage";

// DoD Ticket 3.1: 50 parallele Rechnungen ohne Lücke/Dublette im
// Nummernkreis; PDF mit korrektem SHA-256 im Storage; idempotent.

let orgId: string;
let legalEntityId: string;
let orderIds: string[] = [];

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR = mkdtempSync(
    path.join(tmpdir(), "dtd-invoices-"),
  );
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Inv Org", slug: "org-invoices" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Rechnungs GmbH",
      legalForm: "GmbH",
      street: "Rechnungsweg 9",
      zip: "50667",
      city: "Köln",
      taxNumber: "215/5310/0000",
      invoicePrefix: "TT",
      defaultTaxRateBp: 1900,
      email: "int-test-inv-le@example.org",
    },
  });
  legalEntityId = legalEntity.id;
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId,
      name: "Inv Venue",
      slug: "venue-invoices",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
    },
  });
  const buyer = await prisma.user.create({
    data: { email: "int-test-inv-buyer@example.org", name: "Inv Käufer" },
  });

  orderIds = [];
  for (let i = 0; i < 50; i++) {
    const order = await prisma.order.create({
      data: {
        organisationId: orgId,
        venueId: venue.id,
        userId: buyer.id,
        legalEntityId,
        number: `ORD-INV-${String(i).padStart(3, "0")}`,
        status: "PAID",
        subtotalCents: 8403,
        taxCents: 1597,
        totalCents: 10000,
        billingSnapshot: {
          name: "Inv Käufer",
          street: "Weg 1",
          zip: "51063",
          city: "Köln",
          country: "DE",
        },
        termsVersion: "v1",
        paidAt: new Date(),
        items: {
          create: {
            productType: "SUBSCRIPTION",
            description: `Testposition ${i}`,
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
    orderIds.push(order.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Rechnungsmodul (3.1)", () => {
  it("50 parallele Rechnungen: Nummernkreis lückenlos und eindeutig", async () => {
    const invoices = await Promise.all(
      orderIds.map((id) => createInvoiceForOrder(id)),
    );
    expect(invoices).toHaveLength(50);

    const numbers = invoices.map((inv) => inv.number).sort();
    const year = new Date().getUTCFullYear();
    const expected = Array.from(
      { length: 50 },
      (_, i) => `TT-${year}-${String(i + 1).padStart(6, "0")}`,
    );
    expect(numbers).toEqual(expected);

    const seq = await prisma.invoiceSequence.findUniqueOrThrow({
      where: { legalEntityId_year: { legalEntityId, year } },
    });
    expect(seq.lastNumber).toBe(50);
  }, 120_000);

  it("PDF liegt im Storage, Hash stimmt, Datei ist ein PDF", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { legalEntityId },
    });
    const buffer = await readInvoicePdf(invoice.pdfKey);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sha256(buffer)).toBe(invoice.pdfSha256);
    expect(invoice.issuerSnapshot).toMatchObject({ name: "Rechnungs GmbH" });
    expect(invoice.recipientSnapshot).toMatchObject({ zip: "51063" });
  });

  it("idempotent: zweiter Aufruf liefert dieselbe Rechnung", async () => {
    const again = await createInvoiceForOrder(orderIds[0]!);
    const count = await prisma.invoice.count({ where: { legalEntityId } });
    expect(count).toBe(50);
    expect(again.number).toMatch(/^TT-/);
  });

  it("unbezahlte Bestellung bekommt keine Rechnung", async () => {
    const order = await prisma.order.findFirstOrThrow({
      where: { id: orderIds[1] },
    });
    const draft = await prisma.order.create({
      data: {
        organisationId: orgId,
        venueId: order.venueId,
        userId: order.userId,
        legalEntityId,
        number: "ORD-INV-DRAFT",
        status: "AWAITING_PAYMENT",
        subtotalCents: 100,
        taxCents: 19,
        totalCents: 119,
        billingSnapshot: {},
        termsVersion: "v1",
      },
    });
    await expect(createInvoiceForOrder(draft.id)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});
