import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TZDate } from "@date-fns/tz";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import {
  adminCancelBooking,
  createManualBooking,
  markNoShow,
  moveBooking,
} from "./admin-booking";

// Ticket 5.4 (K4/G7/I4): manuelle Belegung (frei/mit Rechnung + manueller
// Zahlart), Verschieben, Stornieren, No-Show.

const TZ = "Europe/Berlin";
const ALL_DAY: [string, string][] = [["08:00", "22:00"]];

let orgId: string;
let venueId: string;
let court1: string;
let court2: string;
let staffId: string;
let customerId: string;

const ctx = () => ({ organisationId: orgId });

function dateStr(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeAll(async () => {
  process.env.INVOICE_STORAGE_DIR ??= mkdtempSync(
    path.join(tmpdir(), "dtd-adm-"),
  );
  await cleanupTestDb();

  const org = await prisma.organisation.create({
    data: { name: "Adm Org", slug: "org-admin-booking" },
  });
  orgId = org.id;
  const legalEntity = await prisma.legalEntity.create({
    data: {
      organisationId: orgId,
      name: "Adm GmbH",
      legalForm: "GmbH",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      invoicePrefix: "AD",
      defaultTaxRateBp: 1900,
      email: "int-test-adm-le@example.org",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      organisationId: orgId,
      legalEntityId: legalEntity.id,
      name: "Adm Venue",
      slug: "venue-admin-booking",
      street: "Weg 1",
      zip: "50667",
      city: "Köln",
      timezone: TZ,
      slotMinutes: 60,
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
  court1 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld A1" },
    })
  ).id;
  court2 = (
    await prisma.court.create({
      data: { organisationId: orgId, venueId, name: "Feld A2" },
    })
  ).id;

  staffId = (
    await prisma.user.create({
      data: { email: "int-test-adm-staff@example.org", name: "Adm Staff" },
    })
  ).id;

  const customer = await prisma.user.create({
    data: {
      email: "int-test-adm-kunde@example.org",
      name: "Adm Kunde",
      billingStreet: "Weg 2",
      billingZip: "50667",
      billingCity: "Köln",
      billingCountry: "DE",
    },
  });
  customerId = customer.id;
  await prisma.membership.create({
    data: { userId: customerId, organisationId: orgId, role: "CUSTOMER" },
  });

  const season = await prisma.season.create({
    data: {
      organisationId: orgId,
      venueId,
      name: "Adm Saison",
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
      priority: 10,
      label: "Adm Regel",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createManualBooking (5.4)", () => {
  it("kostenlose interne Belegung ohne Bestellung", async () => {
    const result = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court1,
        date: dateStr(2),
        time: "10:00",
        durationMin: 120,
        mode: "FREE",
        usageType: "INTERN",
        label: "Aufbau Event",
      },
      staffId,
    );
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking).toMatchObject({
      status: "CONFIRMED",
      source: "ADMIN",
      usageType: "INTERN",
      label: "Aufbau Event",
      priceCents: 0,
      orderItemId: null,
    });
    expect(result.orderId).toBeUndefined();
  });

  it("Konflikt auf belegtem Slot wirft SLOT_TAKEN", async () => {
    await expect(
      createManualBooking(
        ctx(),
        {
          venueId,
          courtId: court1,
          date: dateStr(2),
          time: "11:00",
          durationMin: 60,
          mode: "FREE",
          usageType: "INTERN",
        },
        staffId,
      ),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("mit Rechnung nach Preisregeln: Order PAID, Payment MANUAL, Rechnung", async () => {
    const result = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court1,
        date: dateStr(3),
        time: "10:00",
        durationMin: 60,
        mode: "INVOICE",
        customerEmail: "int-test-adm-kunde@example.org",
        pricing: "RULES",
        paymentMethod: "cash",
      },
      staffId,
    );
    expect(result.invoiceNumber).toMatch(/^AD-/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId! },
      include: { payments: true },
    });
    expect(order.status).toBe("PAID");
    expect(order.totalCents).toBe(3000);
    expect(order.paymentMethodType).toBe("cash");
    expect(order.payments[0]).toMatchObject({
      provider: "MANUAL",
      method: "cash",
      status: "SUCCEEDED",
      amountCents: 3000,
    });

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.priceCents).toBe(3000);
    expect(booking.orderItemId).not.toBeNull();

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { orderId: result.orderId! },
    });
    expect(invoice.grossCents).toBe(3000);
  });

  it("mit manuellem Betrag und Überweisung", async () => {
    const result = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court1,
        date: dateStr(3),
        time: "12:00",
        durationMin: 60,
        mode: "INVOICE",
        customerEmail: "int-test-adm-kunde@example.org",
        pricing: "MANUAL",
        manualGrossCents: 1234,
        paymentMethod: "transfer",
      },
      staffId,
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId! },
    });
    expect(order.totalCents).toBe(1234);
    expect(order.paymentMethodType).toBe("transfer");
  });

  it("unbekannte Kunden-E-Mail und fehlende Rechnungsadresse werden abgewiesen", async () => {
    await expect(
      createManualBooking(
        ctx(),
        {
          venueId,
          courtId: court2,
          date: dateStr(3),
          time: "10:00",
          durationMin: 60,
          mode: "INVOICE",
          customerEmail: "niemand@example.org",
          pricing: "RULES",
          paymentMethod: "cash",
        },
        staffId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const noAddress = await prisma.user.create({
      data: { email: "int-test-adm-ohne@example.org", name: "Ohne Adresse" },
    });
    await prisma.membership.create({
      data: { userId: noAddress.id, organisationId: orgId, role: "CUSTOMER" },
    });
    await expect(
      createManualBooking(
        ctx(),
        {
          venueId,
          courtId: court2,
          date: dateStr(3),
          time: "10:00",
          durationMin: 60,
          mode: "INVOICE",
          customerEmail: "int-test-adm-ohne@example.org",
          pricing: "RULES",
          paymentMethod: "cash",
        },
        staffId,
      ),
    ).rejects.toMatchObject({ code: "BILLING_ADDRESS_REQUIRED" });
  });
});

describe("moveBooking / adminCancelBooking / markNoShow (5.4)", () => {
  it("verschiebt auf freien Slot, Konflikt wirft SLOT_TAKEN", async () => {
    const { bookingId } = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court2,
        date: dateStr(4),
        time: "10:00",
        durationMin: 60,
        mode: "FREE",
        usageType: "INTERN",
        label: "Verschieb mich",
      },
      staffId,
    );

    await moveBooking(
      ctx(),
      { bookingId, courtId: court2, date: dateStr(4), time: "14:00" },
      staffId,
    );
    const moved = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const local = new TZDate(moved.startAt.getTime(), TZ);
    expect(local.getHours()).toBe(14);

    // Blocker auf 16:00, dann Verschiebe-Versuch dorthin
    await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court2,
        date: dateStr(4),
        time: "16:00",
        durationMin: 60,
        mode: "FREE",
        usageType: "INTERN",
      },
      staffId,
    );
    await expect(
      moveBooking(
        ctx(),
        { bookingId, courtId: court2, date: dateStr(4), time: "16:00" },
        staffId,
      ),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("Storno setzt CANCELLED und nennt die Bestellung", async () => {
    const withOrder = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court2,
        date: dateStr(5),
        time: "10:00",
        durationMin: 60,
        mode: "INVOICE",
        customerEmail: "int-test-adm-kunde@example.org",
        pricing: "MANUAL",
        manualGrossCents: 2000,
        paymentMethod: "cash",
      },
      staffId,
    );
    const { orderId } = await adminCancelBooking(
      ctx(),
      withOrder.bookingId,
      staffId,
    );
    expect(orderId).toBe(withOrder.orderId);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: withOrder.bookingId },
    });
    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledByUserId).toBe(staffId);

    // Doppelt stornieren geht nicht
    await expect(
      adminCancelBooking(ctx(), withOrder.bookingId, staffId),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("No-Show nur aus CONFIRMED", async () => {
    const { bookingId } = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court2,
        date: dateStr(6),
        time: "10:00",
        durationMin: 60,
        mode: "FREE",
        usageType: "KOMMERZIELL",
        customerEmail: "int-test-adm-kunde@example.org",
      },
      staffId,
    );
    await markNoShow(ctx(), bookingId, staffId);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.status).toBe("NO_SHOW");

    await expect(
      markNoShow(ctx(), bookingId, staffId),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("fremder Mandant kann nichts stornieren", async () => {
    const { bookingId } = await createManualBooking(
      ctx(),
      {
        venueId,
        courtId: court2,
        date: dateStr(7),
        time: "10:00",
        durationMin: 60,
        mode: "FREE",
        usageType: "INTERN",
      },
      staffId,
    );
    await expect(
      adminCancelBooking({ organisationId: "fremd" }, bookingId, staffId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
