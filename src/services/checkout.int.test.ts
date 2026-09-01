import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import { startStripeCheckout } from "./checkout";

// D7 (Ticket 4.3): kurzfristige Termine (< sepaLeadDays) bekommen kein SEPA.

const sessionCreate = vi.fn(async (args: unknown) => {
  void args;
  return { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" };
});
vi.mock("./stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionCreate } },
    customers: { create: vi.fn(async () => ({ id: "cus_test_1" })) },
  }),
}));

let orgId: string;
let venueId: string;
let legalEntityId: string;
let courtId: string;
let userId: string;

async function makeOrderWithBooking(startAt: Date): Promise<string> {
  const order = await prisma.order.create({
    data: {
      organisationId: orgId,
      venueId,
      userId,
      legalEntityId,
      number: `ORD-CHK-${startAt.getTime()}`,
      status: "AWAITING_PAYMENT",
      subtotalCents: 2521,
      taxCents: 479,
      totalCents: 3000,
      billingSnapshot: {},
      termsVersion: "v1",
      items: {
        create: {
          productType: "SINGLE_BOOKING",
          description: "Testbuchung",
          servicePeriodFrom: startAt,
          servicePeriodTo: new Date(startAt.getTime() + 3_600_000),
          quantity: 1,
          unitCents: 3000,
          taxRateBp: 1900,
          netCents: 2521,
          taxCents: 479,
          grossCents: 3000,
        },
      },
    },
    include: { items: true },
  });
  await prisma.booking.create({
    data: {
      organisationId: orgId,
      venueId,
      courtId,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      kind: "CUSTOMER",
      status: "HOLD",
      usageType: "KOMMERZIELL",
      source: "ONLINE",
      userId,
      orderItemId: order.items[0]!.id,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  return order.id;
}

beforeAll(async () => {
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Chk Org", slug: "org-checkout" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Chk GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "CK",
      defaultTaxRateBp: 1900,
      email: "int-test-chk-le@example.org",
    },
  });
  legalEntityId = legalEntity.id;
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId,
      name: "Chk Venue",
      slug: "venue-checkout",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      openingHours: {},
      sepaLeadDays: 5,
    },
  });
  venueId = venue.id;
  const court = await prisma.court.create({
    data: { organisationId: orgId, venueId, name: "Feld K" },
  });
  courtId = court.id;
  const user = await prisma.user.create({
    data: { email: "int-test-chk-buyer@example.org", name: "Chk Käufer" },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("startStripeCheckout – sepaLeadDays (D7)", () => {
  it("Termin in 2 Tagen: nur Karte", async () => {
    sessionCreate.mockClear();
    const orderId = await makeOrderWithBooking(
      new Date(Date.now() + 2 * 86_400_000),
    );
    const result = await startStripeCheckout(
      { organisationId: orgId },
      { orderId, userId, baseUrl: "http://localhost:3000" },
    );
    expect(result.url).toContain("checkout.stripe.test");
    const args = sessionCreate.mock.calls[0]![0] as {
      payment_method_types: string[];
    };
    expect(args.payment_method_types).toEqual(["card"]);
  });

  it("Termin in 10 Tagen: Karte und SEPA", async () => {
    sessionCreate.mockClear();
    const orderId = await makeOrderWithBooking(
      new Date(Date.now() + 10 * 86_400_000),
    );
    await startStripeCheckout(
      { organisationId: orgId },
      { orderId, userId, baseUrl: "http://localhost:3000" },
    );
    const args = sessionCreate.mock.calls[0]![0] as {
      payment_method_types: string[];
    };
    expect(args.payment_method_types).toEqual(["card", "sepa_debit"]);
  });
});
