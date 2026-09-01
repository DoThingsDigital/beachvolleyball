import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import {
  findClubMembers,
  importClubMembers,
  isActiveClubMember,
  requestClubMembership,
  setClubMembershipStatus,
} from "@/src/db/club-memberships";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { createSingleBookingOrder } from "./single-booking";

// Ticket 4.6 (A4): Mitgliedschaftsanfrage → Freigabe → Mitgliederpreis,
// Ablehnung mit erneuter Anfrage, Ablaufdatum, Listenimport.

let orgId: string;
let venueId: string;
let courtId: string;
let clubId: string;
let clubAdminId: string;
let memberId: string;

const ctx = () => ({ organisationId: orgId });

const ALL_DAY: [string, string][] = [["08:00", "22:00"]];

// Morgen 10:00 lokal liegt immer im Vorlauf/Horizont-Fenster und in der
// Öffnungszeit; verschiedene Tests nutzen verschiedene Startzeiten.
function tomorrowAt(hour: number): { date: string; time: string } {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    date: `${y}-${m}-${day}`,
    time: `${String(hour).padStart(2, "0")}:00`,
  };
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Club Org", slug: "org-club-membership" },
  });
  orgId = org.id;

  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Club GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "CM",
      defaultTaxRateBp: 1900,
      email: "int-test-cm-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "CM Venue",
      slug: "venue-club-membership",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      slotMinutes: 60,
      leadTimeMin: 60,
      horizonDays: 14,
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
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld CM" },
  });
  courtId = court.id;

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "CM Saison",
      startDate: new Date(Date.now() - 30 * 86_400_000),
      endDate: new Date(Date.now() + 30 * 86_400_000),
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
      pricePerHourCents: 2600,
      memberPricePerHourCents: 2200,
      priority: 10,
      label: "CM Regel",
    },
  });

  const club = await prisma.club.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "CM Verein",
      contactEmail: "int-test-cm-club@example.org",
    },
  });
  clubId = club.id;

  const clubAdmin = await prisma.user.create({
    data: { email: "int-test-cm-admin@example.org", name: "CM Vereins-Admin" },
  });
  clubAdminId = clubAdmin.id;
  await prisma.clubMembership.create({
    data: {
      organisationId: orgId,
      userId: clubAdminId,
      clubId,
      status: "ACTIVE",
      isClubAdmin: true,
    },
  });

  const member = await prisma.user.create({
    data: {
      email: "int-test-cm-member@example.org",
      name: "CM Mitglied",
      billingStreet: "Weg 2",
      billingZip: "50667",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  memberId = member.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Mitgliedschaftsanfrage und Freigabe (4.6, A4)", () => {
  it("Anfrage → PENDING, noch kein Mitgliederpreis, Freigabe aktiviert", async () => {
    const result = await requestClubMembership(ctx(), memberId, clubId);
    expect(result).toBe("created");
    expect(await isActiveClubMember(ctx(), memberId)).toBe(false);

    // Doppelte Anfrage ist ein No-op
    expect(await requestClubMembership(ctx(), memberId, clubId)).toBe("exists");

    const pending = (await findClubMembers(ctx(), clubId)).find(
      (m) => m.userId === memberId,
    );
    expect(pending?.status).toBe("PENDING");

    const ok = await setClubMembershipStatus(
      ctx(),
      pending!.id,
      clubId,
      "ACTIVE",
      clubAdminId,
    );
    expect(ok).toBe(true);
    expect(await isActiveClubMember(ctx(), memberId)).toBe(true);
  });

  it("aktives Mitglied zahlt den Mitgliederpreis (Bestellung)", async () => {
    const { date, time } = tomorrowAt(10);
    const { orderId } = await createSingleBookingOrder(ctx(), {
      userId: memberId,
      venueId,
      courtId,
      date,
      time,
      durationMin: 60,
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(order.totalCents).toBe(2200);
    expect(order.items[0]?.priceBreakdown).toMatchObject({
      memberRateApplied: true,
    });
  });

  it("Nichtmitglied zahlt den Normalpreis", async () => {
    const guest = await prisma.user.create({
      data: {
        email: "int-test-cm-guest@example.org",
        name: "CM Gast",
        billingStreet: "Weg 3",
        billingZip: "50667",
        billingCity: "Köln",
        billingCountry: "DE",
      },
    });
    const { date, time } = tomorrowAt(11);
    const { orderId } = await createSingleBookingOrder(ctx(), {
      userId: guest.id,
      venueId,
      courtId,
      date,
      time,
      durationMin: 60,
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(2600);
  });

  it("Ablehnung beendet die Berechtigung, erneute Anfrage möglich", async () => {
    const membership = (await findClubMembers(ctx(), clubId)).find(
      (m) => m.userId === memberId,
    );
    await setClubMembershipStatus(
      ctx(),
      membership!.id,
      clubId,
      "REJECTED",
      clubAdminId,
    );
    expect(await isActiveClubMember(ctx(), memberId)).toBe(false);

    expect(await requestClubMembership(ctx(), memberId, clubId)).toBe("created");
    const again = (await findClubMembers(ctx(), clubId)).find(
      (m) => m.userId === memberId,
    );
    expect(again?.status).toBe("PENDING");
  });

  it("abgelaufene Mitgliedschaft zählt nicht", async () => {
    const expired = await prisma.user.create({
      data: { email: "int-test-cm-expired@example.org" },
    });
    await prisma.clubMembership.create({
      data: {
        organisationId: orgId,
        userId: expired.id,
        clubId,
        status: "ACTIVE",
        validUntil: new Date(Date.now() - 86_400_000),
      },
    });
    expect(await isActiveClubMember(ctx(), expired.id)).toBe(false);
  });

  it("fremder Mandant sieht und ändert nichts", async () => {
    const otherOrg = await prisma.organisation.create({
      data: { name: "Fremd", slug: "org-club-membership-fremd" },
    });
    const foreignCtx = { organisationId: otherOrg.id };
    expect(await findClubMembers(foreignCtx, clubId)).toHaveLength(0);
    expect(await isActiveClubMember(foreignCtx, clubAdminId)).toBe(false);

    const membership = (await findClubMembers(ctx(), clubId)).find(
      (m) => m.userId === memberId,
    );
    const ok = await setClubMembershipStatus(
      foreignCtx,
      membership!.id,
      clubId,
      "ACTIVE",
      clubAdminId,
    );
    expect(ok).toBe(false);
  });
});

describe("Mitgliederlisten-Import (4.6)", () => {
  it("aktiviert bekannte Konten und meldet unbekannte E-Mails", async () => {
    const known = await prisma.user.create({
      data: { email: "int-test-cm-import@example.org", name: "CM Import" },
    });

    const result = await importClubMembers(
      ctx(),
      clubId,
      ["int-test-cm-import@example.org", "niemand@example.org"],
      clubAdminId,
    );
    expect(result.activated).toBe(1);
    expect(result.unknown).toEqual(["niemand@example.org"]);
    expect(await isActiveClubMember(ctx(), known.id)).toBe(true);

    // Import gibt auch offene Anfragen frei (PENDING → ACTIVE)
    const second = await importClubMembers(
      ctx(),
      clubId,
      ["int-test-cm-member@example.org"],
      clubAdminId,
    );
    expect(second.activated).toBe(1);
    expect(await isActiveClubMember(ctx(), memberId)).toBe(true);
  });
});
