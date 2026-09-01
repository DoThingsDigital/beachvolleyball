import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import {
  buildAuslastungReport,
  buildDauerplatzQuote,
  buildUmsatzReport,
  buildVereinsnutzungReport,
  vereinsnutzungCsv,
  vereinsnutzungPdf,
} from "./reports";

// Tickets 6.1–6.4: Report-Aggregate. Feste Referenzwoche Mo 04.01.–So
// 10.01.2027 (CET, keine DST-Kante) mit konstruierter Belegungslage.

const TZ = "Europe/Berlin";
// Mo–Fr 08–22 (14 h), Sa+So 09–21 (12 h) → 94 h je Platz und Woche
const OPENING = {
  mon: [["08:00", "22:00"]],
  tue: [["08:00", "22:00"]],
  wed: [["08:00", "22:00"]],
  thu: [["08:00", "22:00"]],
  fri: [["08:00", "22:00"]],
  sat: [["09:00", "21:00"]],
  sun: [["09:00", "21:00"]],
};

const FROM = "2027-01-04";
const TO = "2027-01-10";

let orgId: string;
let venueId: string;
let court1: string;
let court2: string;
let userId: string;

const ctx = () => ({ organisationId: orgId });

function at(day: number, hour: number): Date {
  // Tag im Januar 2027, CET (+01:00)
  return new Date(
    `2027-01-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+01:00`,
  );
}

async function booking(params: {
  courtId: string;
  day: number;
  hour: number;
  hours?: number;
  kind?: "CUSTOMER" | "SUBSCRIPTION" | "BLOCK";
  usageType?: "KOMMERZIELL" | "VEREIN" | "LIGA" | "INTERN";
  status?: "CONFIRMED" | "RELEASED" | "NO_SHOW" | "CANCELLED";
}) {
  const startAt = at(params.day, params.hour);
  return prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId: params.courtId,
      startAt,
      endAt: new Date(startAt.getTime() + (params.hours ?? 1) * 3_600_000),
      kind: params.kind ?? "CUSTOMER",
      status: params.status ?? "CONFIRMED",
      usageType: params.usageType ?? "KOMMERZIELL",
      source: "ADMIN",
      userId,
    },
  });
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Rep Org", slug: "org-reports" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Rep GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "RP",
      defaultTaxRateBp: 1900,
      email: "int-test-rp-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Rep Venue",
      slug: "venue-reports",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      openingHours: OPENING,
    },
  });
  venueId = venue.id;
  court1 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld R1" },
    })
  ).id;
  court2 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld R2" },
    })
  ).id;
  userId = (
    await prisma.user.create({ data: { email: "int-test-rp-user@example.org" } })
  ).id;

  // Belegungslage in der Referenzwoche:
  // VEREIN: Mo 18–22 (4 h genutzt) + Di 18–22 RELEASED (4 h freigegeben)
  await booking({ courtId: court1, day: 4, hour: 18, hours: 4, kind: "BLOCK", usageType: "VEREIN" });
  await booking({ courtId: court1, day: 5, hour: 18, hours: 4, kind: "BLOCK", usageType: "VEREIN", status: "RELEASED" });
  // LIGA: Mi 19–21 (2 h)
  await booking({ courtId: court2, day: 6, hour: 19, hours: 2, kind: "BLOCK", usageType: "LIGA" });
  // Kommerziell: Mo 10–11 (1 h), Do 10–12 (2 h Dauerplatz), Fr NO_SHOW 1 h
  await booking({ courtId: court1, day: 4, hour: 10 });
  await booking({ courtId: court2, day: 7, hour: 10, hours: 2, kind: "SUBSCRIPTION" });
  await booking({ courtId: court2, day: 8, hour: 10, status: "NO_SHOW" });
  // INTERN: Sa 9–10 (1 h); CANCELLED zählt nirgends
  await booking({ courtId: court1, day: 9, hour: 9, usageType: "INTERN" });
  await booking({ courtId: court1, day: 8, hour: 15, status: "CANCELLED" });
  // Außerhalb des Zeitraums: zählt nicht
  await booking({ courtId: court1, day: 12, hour: 10 });

  // Umsatz: zwei bezahlte Bestellungen im Zeitraum, eine außerhalb
  async function order(params: {
    number: string;
    paidAt: Date;
    grossCents: number;
    productType: "SINGLE_BOOKING" | "SUBSCRIPTION";
    method: string;
  }) {
    return prisma.order.create({
      data: {
        organisationId: orgId,
        venueId,
        userId,
        legalEntityId: legalEntity.id,
        number: params.number,
        status: "PAID",
        subtotalCents: params.grossCents,
        taxCents: 0,
        totalCents: params.grossCents,
        paymentMethodType: params.method,
        billingSnapshot: {},
        termsVersion: "v1",
        paidAt: params.paidAt,
        items: {
          create: {
            productType: params.productType,
            description: "Test",
            servicePeriodFrom: params.paidAt,
            servicePeriodTo: params.paidAt,
            quantity: 1,
            unitCents: params.grossCents,
            taxRateBp: 1900,
            netCents: Math.round((params.grossCents * 10000) / 11900),
            taxCents:
              params.grossCents - Math.round((params.grossCents * 10000) / 11900),
            grossCents: params.grossCents,
          },
        },
      },
    });
  }
  await order({
    number: "ORD-RP-1",
    paidAt: at(5, 12),
    grossCents: 3000,
    productType: "SINGLE_BOOKING",
    method: "card",
  });
  await order({
    number: "ORD-RP-2",
    paidAt: at(6, 12),
    grossCents: 50000,
    productType: "SUBSCRIPTION",
    method: "sepa_debit",
  });
  await order({
    number: "ORD-RP-3",
    paidAt: at(20, 12),
    grossCents: 9999,
    productType: "SINGLE_BOOKING",
    method: "card",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Vereinsnutzung (6.3, L3)", () => {
  it("vier Quoten mit Vorhaltung/Auslastung in beiden Basen", async () => {
    const report = await buildVereinsnutzungReport(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
    });

    // Vorhaltung: 4 (VEREIN) + 4 (RELEASED) + 2 (LIGA) = 10 h
    expect(report.totals.vereinVorhaltung).toBeCloseTo(10, 5);
    // Auslastung: ohne RELEASED = 6 h
    expect(report.totals.vereinAuslastung).toBeCloseTo(6, 5);
    // belegt gesamt: 6 (VEREIN/LIGA) + 1 + 2 + 1 (kommerziell inkl. NO_SHOW) + 1 (intern) = 11
    expect(report.totals.belegtGesamt).toBeCloseTo(11, 5);
    expect(report.totals.releasedStunden).toBeCloseTo(4, 5);
    // verfügbar: 94 h × 2 Plätze
    expect(report.availableHours).toBe(188);

    expect(report.quotas.vorhaltungVsVerfuegbar).toBeCloseTo(10 / 188, 5);
    expect(report.quotas.vorhaltungVsBelegt).toBeCloseTo(10 / 15, 5);
    expect(report.quotas.auslastungVsVerfuegbar).toBeCloseTo(6 / 188, 5);
    expect(report.quotas.auslastungVsBelegt).toBeCloseTo(6 / 11, 5);

    const csv = vereinsnutzungCsv(report);
    expect(csv).toContain("Vereinsnutzungs-Report");
    expect(csv).toContain("Definitionen");
    expect(csv).toContain("Vorhaltung / verfügbare Feldstunden");

    const pdf = await vereinsnutzungPdf(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
    });
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.filename).toContain("Vereinsnutzung");
  });
});

describe("Auslastung (6.1, L1)", () => {
  it("gruppiert nach Platz mit Quote", async () => {
    const report = await buildAuslastungReport(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
      groupBy: "court",
    });
    expect(report.totalHours).toBeCloseTo(11, 5);
    const r1 = report.rows.find((r) => r.key === "Feld R1")!;
    // Feld R1: 4 (VEREIN) + 1 (kommerziell) + 1 (intern) = 6 h von 94
    expect(r1.hours).toBeCloseTo(6, 5);
    expect(r1.quote).toBeCloseTo(6 / 94, 5);
  });

  it("gruppiert nach Tag", async () => {
    const report = await buildAuslastungReport(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
      groupBy: "day",
    });
    const monday = report.rows.find((r) => r.key === "2027-01-04")!;
    expect(monday.hours).toBeCloseTo(5, 5); // 4 VEREIN + 1 kommerziell
    expect(monday.availableHours).toBe(28); // 14 h × 2 Plätze
  });
});

describe("Umsatz (6.2, L2)", () => {
  it("summiert je Produktart × Zahlart, Zeitraum nach paidAt", async () => {
    const report = await buildUmsatzReport(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
    });
    expect(report.totals.grossCents).toBe(53000);
    const single = report.rows.find(
      (r) => r.productType === "SINGLE_BOOKING" && r.paymentMethod === "card",
    )!;
    expect(single.grossCents).toBe(3000);
    expect(single.orderCount).toBe(1);
    const sub = report.rows.find((r) => r.productType === "SUBSCRIPTION")!;
    expect(sub.paymentMethod).toBe("sepa_debit");
    expect(sub.grossCents).toBe(50000);
    // Netto+Steuer = Brutto (Rundung pro Position)
    expect(report.totals.netCents + report.totals.taxCents).toBe(53000);
  });
});

describe("Dauerplatz-Quote (6.4, L4)", () => {
  it("Anteil Dauerplatz an kundenbelegten Stunden", async () => {
    const report = await buildDauerplatzQuote(ctx(), {
      venueId,
      dateFrom: FROM,
      dateTo: TO,
    });
    // Kunde: 1 + 1 (NO_SHOW) = 2 h; Dauerplatz: 2 h → Quote 0,5
    expect(report.subscriptionHours).toBeCloseTo(2, 5);
    expect(report.customerHours).toBeCloseTo(2, 5);
    expect(report.quote).toBeCloseTo(0.5, 5);
  });
});
