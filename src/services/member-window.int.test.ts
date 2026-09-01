import { TZDate } from "@date-fns/tz";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { buildVereinsnutzungReport } from "./reports";
import {
  createSingleBookingOrder,
  getSingleBookingQuote,
} from "./single-booking";

// E-005: Mitglieder-Buchungsfenster – nur aktive Mitglieder des
// Fenster-Vereins buchen vor der Freigabefrist; individuell bezahlt,
// usageType VEREIN (Sportamt-Auslastung); danach frei für alle.

const TZ = "Europe/Berlin";
const ALL_DAY: [string, string][] = [["08:00", "22:00"]];

let orgId: string;
let venueId: string;
let courtId: string;
let clubId: string;
let memberId: string;
let guestId: string;
let otherClubMemberId: string;

const ctx = () => ({ organisationId: orgId });

function slotAt(daysFromNow: number, hour: number) {
  const base = new Date(Date.now() + daysFromNow * 86_400_000);
  const local = new TZDate(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hour,
    0,
    TZ,
  );
  const startAt = new Date(local.getTime());
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return {
    startAt,
    date: `${y}-${m}-${d}`,
    time: `${String(hour).padStart(2, "0")}:00`,
  };
}

async function makeUser(email: string, member: "THIS" | "OTHER" | "NONE") {
  const user = await prisma.user.create({
    data: {
      email,
      name: email.split("@")[0],
      billingStreet: "Weg 1",
      billingZip: "50667",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  if (member !== "NONE") {
    const targetClub =
      member === "THIS"
        ? clubId
        : (
            await prisma.club.create({
              data: {
                organisationId: orgId,
                venueId,
                name: `Anderer Verein ${email}`,
                contactEmail: email,
              },
            })
          ).id;
    await prisma.clubMembership.create({
      data: {
        organisationId: orgId,
        userId: user.id,
        clubId: targetClub,
        status: "ACTIVE",
      },
    });
  }
  return user.id;
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "MW Org", slug: "org-member-window" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "MW GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "MW",
      defaultTaxRateBp: 1900,
      email: "int-test-mw-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "MW Venue",
      slug: "venue-member-window",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      slotMinutes: 60,
      leadTimeMin: 60,
      horizonDays: 14,
      releaseHoursBefore: 48,
      openingHours: {
        mon: ALL_DAY,
        tue: ALL_DAY,
        wed: ALL_DAY,
        thu: ALL_DAY,
        fri: ALL_DAY,
        sat: ALL_DAY,
        sun: ALL_DAY,
      },
    },
  });
  venueId = venue.id;
  courtId = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld MW" },
    })
  ).id;
  clubId = (
    await prisma.club.create({
      data: {
        organisationId: orgId,
        venueId,
        name: "MW Verein",
        contactEmail: "int-test-mw-club@example.org",
      },
    })
  ).id;

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "MW Saison",
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 28 * 86_400_000),
      status: "ACTIVE",
      subscriptionDiscountBp: 0,
    },
  });
  await prisma.priceRule.create({
    data: {
      organisationId: orgId,
      venueId,
      seasonId: season.id,
      courtIds: [],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timeFrom: "08:00",
      timeTo: "22:00",
      pricePerHourCents: 3000,
      memberPricePerHourCents: 2400,
      priority: 10,
      label: "MW Regel",
    },
  });

  const admin = await prisma.user.create({
    data: { email: "int-test-mw-admin@example.org" },
  });
  // Fenster: täglich 18–20 Uhr (Serie ohne Ende; Saisonfenster begrenzt)
  const anchor = slotAt(1, 18);
  await prisma.block.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      clubId,
      type: "VEREIN",
      title: "MW Fenster",
      startAt: anchor.startAt,
      endAt: new Date(anchor.startAt.getTime() + 2 * 3_600_000),
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
      memberSelfBooking: true,
      createdByUserId: admin.id,
    },
  });

  memberId = await makeUser("int-test-mw-member@example.org", "THIS");
  guestId = await makeUser("int-test-mw-guest@example.org", "NONE");
  otherClubMemberId = await makeUser("int-test-mw-other@example.org", "OTHER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Mitglieder-Buchungsfenster (E-005)", () => {
  it("Gast wird vor der Freigabefrist abgewiesen (MEMBERS_ONLY)", async () => {
    const slot = slotAt(4, 18); // > 48 h entfernt
    await expect(
      getSingleBookingQuote(ctx(), {
        venueId,
        courtId,
        date: slot.date,
        time: slot.time,
        durationMin: 60,
        isMember: false,
        userId: guestId,
      }),
    ).rejects.toMatchObject({ code: "MEMBERS_ONLY" });

    // Anonym (ohne userId) ebenso
    await expect(
      getSingleBookingQuote(ctx(), {
        venueId,
        courtId,
        date: slot.date,
        time: slot.time,
        durationMin: 60,
        isMember: false,
      }),
    ).rejects.toMatchObject({ code: "MEMBERS_ONLY" });
  });

  it("Mitglied eines anderen Vereins wird ebenfalls abgewiesen", async () => {
    const slot = slotAt(4, 19);
    await expect(
      getSingleBookingQuote(ctx(), {
        venueId,
        courtId,
        date: slot.date,
        time: slot.time,
        durationMin: 60,
        isMember: true,
        userId: otherClubMemberId,
      }),
    ).rejects.toMatchObject({ code: "MEMBERS_ONLY" });
  });

  it("Mitglied bucht selbst: Mitgliederpreis, usageType VEREIN, clubId", async () => {
    const slot = slotAt(4, 18);
    const { orderId } = await createSingleBookingOrder(ctx(), {
      userId: memberId,
      venueId,
      courtId,
      date: slot.date,
      time: slot.time,
      durationMin: 60,
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.totalCents).toBe(2400); // Mitgliederpreis

    const booking = await prisma.booking.findFirstOrThrow({
      where: { orderItem: { orderId } },
    });
    expect(booking.usageType).toBe("VEREIN");
    expect(booking.clubId).toBe(clubId);
    expect(booking.kind).toBe("CUSTOMER");

    // Zahlung simulieren: erst CONFIRMED zählt im Report als Auslastung
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  });

  it("nach der Freigabefrist bucht auch ein Gast (KOMMERZIELL)", async () => {
    const slot = slotAt(1, 19); // < 48 h entfernt
    const { orderId } = await createSingleBookingOrder(ctx(), {
      userId: guestId,
      venueId,
      courtId,
      date: slot.date,
      time: slot.time,
      durationMin: 60,
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(3000); // Normalpreis

    const booking = await prisma.booking.findFirstOrThrow({
      where: { orderItem: { orderId } },
    });
    expect(booking.usageType).toBe("KOMMERZIELL");
    expect(booking.clubId).toBeNull();
  });

  it("Slots außerhalb des Fensters bleiben für alle frei", async () => {
    const slot = slotAt(4, 10); // vormittags, kein Fenster
    const quote = await getSingleBookingQuote(ctx(), {
      venueId,
      courtId,
      date: slot.date,
      time: slot.time,
      durationMin: 60,
      isMember: false,
      userId: guestId,
    });
    expect(quote.usageType).toBe("KOMMERZIELL");
  });

  it("Report: Fensterstunden zählen als Vorhaltung, Mitgliederbuchung als Auslastung", async () => {
    const from = slotAt(0, 8).date;
    const to = slotAt(13, 8).date;
    const report = await buildVereinsnutzungReport(ctx(), {
      venueId,
      dateFrom: from,
      dateTo: to,
    });
    // Serie beginnt morgen: 13 Fenstertage × 2 h = 26 h Vorhaltung
    expect(report.totals.vereinVorhaltung).toBeCloseTo(26, 5);
    // Auslastung: genau die 1 h Mitgliederbuchung (Gast-Buchung ist KOMMERZIELL)
    expect(report.totals.vereinAuslastung).toBeCloseTo(1, 5);
  });
});
