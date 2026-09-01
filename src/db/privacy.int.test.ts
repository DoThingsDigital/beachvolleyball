import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { anonymizeUser, exportUserData } from "./privacy";

// Ticket 6.5 (A5): Datenauskunft + Anonymisierung. DoD: Rechnungen bleiben.

let orgId: string;
let venueId: string;
let courtId: string;
let userId: string;

const ctx = () => ({ organisationId: orgId });

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Priv Org", slug: "org-privacy" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Priv GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "PR",
      defaultTaxRateBp: 1900,
      email: "int-test-pr-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Priv Venue",
      slug: "venue-privacy",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
    },
  });
  venueId = venue.id;
  courtId = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld P" },
    })
  ).id;

  const user = await prisma.user.create({
    data: {
      email: "int-test-pr-kunde@example.org",
      name: "Petra Privat",
      phone: "0221 123",
      passwordHash: "x",
      billingStreet: "Privatweg 5",
      billingZip: "50667",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  userId = user.id;
  await prisma.membership.create({
    data: { userId, organisationId: orgId, role: "CUSTOMER" },
  });

  // Historie: bezahlte Bestellung mit Rechnung + vergangene Buchung + Mails
  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId,
      userId,
      legalEntityId: legalEntity.id,
      number: "ORD-PR-1",
      status: "PAID",
      subtotalCents: 3000,
      taxCents: 0,
      totalCents: 3000,
      billingSnapshot: {
        name: "Petra Privat",
        street: "Privatweg 5",
        zip: "50667",
        city: "Köln",
        country: "DE",
      },
      termsVersion: "v1",
      paidAt: new Date(),
      items: {
        create: {
          productType: "SINGLE_BOOKING",
          description: "Einzelbuchung",
          servicePeriodFrom: new Date(Date.now() - 7 * 86_400_000),
          servicePeriodTo: new Date(Date.now() - 7 * 86_400_000 + 3_600_000),
          quantity: 1,
          unitCents: 3000,
          taxRateBp: 1900,
          netCents: 2521,
          taxCents: 479,
          grossCents: 3000,
        },
      },
    },
  });
  await prisma.invoice.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      number: "PR-2027-000001",
      type: "INVOICE",
      orderId: order.id,
      userId,
      issueDate: new Date(),
      servicePeriodFrom: new Date(),
      servicePeriodTo: new Date(),
      issuerSnapshot: {},
      recipientSnapshot: { name: "Petra Privat", street: "Privatweg 5" },
      lines: [],
      netCents: 2521,
      taxCents: 479,
      grossCents: 3000,
      taxRateBp: 1900,
      pdfKey: "test/pr1.pdf",
      pdfSha256: "x",
      issuedAt: new Date(),
    },
  });
  await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      startAt: new Date(Date.now() - 7 * 86_400_000),
      endAt: new Date(Date.now() - 7 * 86_400_000 + 3_600_000),
      kind: "CUSTOMER",
      status: "CONFIRMED",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId,
    },
  });
  await prisma.emailLog.create({
    data: {
      userId,
      to: "int-test-pr-kunde@example.org",
      template: "order-confirmation",
      templateVersion: "v1",
      status: "SENT",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Datenauskunft (6.5, A5)", () => {
  it("exportiert Profil, Bestellungen, Rechnungen, Buchungen, Mails", async () => {
    const data = await exportUserData(ctx(), userId);
    expect(data).not.toBeNull();
    expect(data!.profile.email).toBe("int-test-pr-kunde@example.org");
    expect(data!.profile.billingStreet).toBe("Privatweg 5");
    expect(data!.orders).toHaveLength(1);
    expect(data!.invoices[0]?.number).toBe("PR-2027-000001");
    expect(data!.bookings).toHaveLength(1);
    expect(data!.emailLog[0]?.to).toBe("int-test-pr-kunde@example.org");
  });

  it("fremder Mandant bekommt nichts", async () => {
    const other = await prisma.organisation.create({
      data: { name: "Fremd", slug: "org-privacy-fremd" },
    });
    expect(await exportUserData({ organisationId: other.id }, userId)).toBeNull();
  });
});

describe("Anonymisierung (6.5, A5)", () => {
  it("blockiert bei zukünftiger aktiver Buchung", async () => {
    const future = await prisma.booking.create({
      data: {
        organisationId: orgId,
        venueId,
        courtId,
        startAt: new Date(Date.now() + 3 * 86_400_000),
        endAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
        kind: "CUSTOMER",
        status: "CONFIRMED",
        usageType: "KOMMERZIELL",
        source: "ONLINE",
        userId,
      },
    });
    const blocked = await anonymizeUser(ctx(), userId);
    expect(blocked).toEqual({ ok: false, blocker: "FUTURE_BOOKINGS" });

    await prisma.booking.update({
      where: { id: future.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });

  it("anonymisiert Profil und Mail-Logs, Rechnung bleibt unverändert", async () => {
    const result = await anonymizeUser(ctx(), userId);
    expect(result).toEqual({ ok: true, alreadyAnonymized: false });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(`anonym-${userId}@anonymisiert.invalid`);
    expect(user.name).toBe("Anonymisiert");
    expect(user.phone).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.billingStreet).toBeNull();
    expect(user.anonymizedAt).not.toBeNull();

    // Rechnung unverändert (DoD) – inkl. Empfänger-Snapshot
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { userId },
    });
    expect(invoice.number).toBe("PR-2027-000001");
    expect(invoice.recipientSnapshot).toMatchObject({ name: "Petra Privat" });

    // Bestellung + Buchung bleiben dem (anonymen) Nutzer zugeordnet
    expect(await prisma.order.count({ where: { userId } })).toBe(1);
    expect(await prisma.booking.count({ where: { userId } })).toBe(2);

    // Mail-Logs geschwärzt
    const mails = await prisma.emailLog.findMany({ where: { userId } });
    expect(mails.every((m) => m.to === "anonymisiert")).toBe(true);

    // Zweiter Aufruf ist ein No-op
    const again = await anonymizeUser(ctx(), userId);
    expect(again).toEqual({ ok: true, alreadyAnonymized: true });
  });
});
