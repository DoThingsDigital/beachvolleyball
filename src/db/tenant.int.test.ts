import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "./client";
import { createRepositories } from "./repositories";
import { cleanupTestDb } from "./test/cleanup";

// Integrationstests (Test-DB): Mandantenisolation (NF3) und
// Doppelbuchungsschutz über das DB-Exclusion-Constraint (D4).

type Fixture = {
  orgId: string;
  venueId: string;
  courtId: string;
};

let a: Fixture;
let b: Fixture;

async function createTenantFixture(slug: string): Promise<Fixture> {
  const org = await prisma.organisation.create({
    data: { name: `Org ${slug}`, slug: `org-${slug}` },
  });
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: org.id,
      name: `LE ${slug}`,
      legalForm: "GmbH",
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: slug.toUpperCase(),
      defaultTaxRateBp: 1900,
      email: `le-${slug}@example.org`,
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: org.id,
      legalEntityId: legalEntity.id,
      name: `Venue ${slug}`,
      slug: `venue-${slug}`,
      street: "Teststr. 1",
      zip: "50667",
      city: "Köln",
      openingHours: { mon: [["08:00", "22:00"]] },
    },
  });
  const court = await prisma.court.create({
    data: {
      organisationId: org.id,
      venueId: venue.id,
      name: "Feld 1",
    },
  });
  return { orgId: org.id, venueId: venue.id, courtId: court.id };
}

beforeAll(async () => {
  await cleanupTestDb();
  a = await createTenantFixture("a");
  b = await createTenantFixture("b");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Mandantenisolation (NF3)", () => {
  it("findMany liefert nur Venues des eigenen Mandanten", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    const venues = await repos.venues.findMany();
    expect(venues).toHaveLength(1);
    expect(venues[0]?.organisationId).toBe(a.orgId);
  });

  it("findById auf fremdes Venue liefert null", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    expect(await repos.venues.findById(b.venueId)).toBeNull();
    expect(await repos.venues.findById(a.venueId)).not.toBeNull();
  });

  it("create stempelt die organisationId aus dem Kontext", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    const booking = await repos.bookings.create({
      venueId: a.venueId,
      courtId: a.courtId,
      startAt: new Date("2026-11-02T09:00:00Z"),
      endAt: new Date("2026-11-02T10:00:00Z"),
      kind: "CUSTOMER",
      status: "CONFIRMED",
      usageType: "KOMMERZIELL",
      source: "ADMIN",
    });
    expect(booking.organisationId).toBe(a.orgId);

    const reposB = createRepositories({ organisationId: b.orgId });
    expect(await reposB.bookings.findById(booking.id)).toBeNull();
  });
});

describe("Doppelbuchungsschutz (D4, booking_no_overlap)", () => {
  const base = {
    kind: "CUSTOMER",
    usageType: "KOMMERZIELL",
    source: "ADMIN",
  } as const;

  it("überlappende aktive Belegung auf demselben Platz wird abgelehnt", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    await repos.bookings.create({
      ...base,
      venueId: a.venueId,
      courtId: a.courtId,
      startAt: new Date("2026-11-03T18:00:00Z"),
      endAt: new Date("2026-11-03T19:00:00Z"),
      status: "CONFIRMED",
    });

    await expect(
      repos.bookings.create({
        ...base,
        venueId: a.venueId,
        courtId: a.courtId,
        startAt: new Date("2026-11-03T18:30:00Z"),
        endAt: new Date("2026-11-03T19:30:00Z"),
        status: "HOLD",
      }),
    ).rejects.toThrowError(/booking_no_overlap|23P01|exclusion/i);
  });

  it("angrenzende Belegung ([start,end) exklusiv) ist erlaubt", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    await expect(
      repos.bookings.create({
        ...base,
        venueId: a.venueId,
        courtId: a.courtId,
        startAt: new Date("2026-11-03T19:00:00Z"),
        endAt: new Date("2026-11-03T20:00:00Z"),
        status: "CONFIRMED",
      }),
    ).resolves.toBeTruthy();
  });

  it("RELEASED blockiert nicht (Freigabe-Logik E3)", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    await repos.bookings.create({
      ...base,
      venueId: a.venueId,
      courtId: a.courtId,
      startAt: new Date("2026-11-04T18:00:00Z"),
      endAt: new Date("2026-11-04T20:00:00Z"),
      status: "RELEASED",
      usageType: "VEREIN",
      kind: "BLOCK",
    });

    await expect(
      repos.bookings.create({
        ...base,
        venueId: a.venueId,
        courtId: a.courtId,
        startAt: new Date("2026-11-04T18:00:00Z"),
        endAt: new Date("2026-11-04T19:00:00Z"),
        status: "CONFIRMED",
        source: "RELEASE_RESALE",
      }),
    ).resolves.toBeTruthy();
  });

  it("stornierte Belegung blockiert nicht", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    await repos.bookings.create({
      ...base,
      venueId: a.venueId,
      courtId: a.courtId,
      startAt: new Date("2026-11-05T10:00:00Z"),
      endAt: new Date("2026-11-05T11:00:00Z"),
      status: "CANCELLED",
    });

    await expect(
      repos.bookings.create({
        ...base,
        venueId: a.venueId,
        courtId: a.courtId,
        startAt: new Date("2026-11-05T10:00:00Z"),
        endAt: new Date("2026-11-05T11:00:00Z"),
        status: "CONFIRMED",
      }),
    ).resolves.toBeTruthy();
  });

  it("gleiche Zeit auf anderem Platz ist erlaubt", async () => {
    const repos = createRepositories({ organisationId: a.orgId });
    const court2 = await prisma.court.create({
      data: { organisationId: a.orgId, venueId: a.venueId, name: "Feld 2" },
    });

    await expect(
      repos.bookings.create({
        ...base,
        venueId: a.venueId,
        courtId: court2.id,
        startAt: new Date("2026-11-03T18:00:00Z"),
        endAt: new Date("2026-11-03T19:00:00Z"),
        status: "CONFIRMED",
      }),
    ).resolves.toBeTruthy();
  });
});
