import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";
import { isExclusionViolation, orderNumber } from "./orders";
import type { TenantContext } from "./tenant";

// Admin-Kalender (Ticket 5.4, K4/G7/I4): DB-Zugriffe.

/** Alle Anzeige-relevanten Belegungen eines Zeitfensters (auch HOLD/
 *  PENDING/RELEASED/NO_SHOW; CANCELLED/EXPIRED bleiben draußen). */
export function findBookingsForAdminCalendar(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date },
) {
  return prisma.booking.findMany({
    where: {
      organisationId: ctx.organisationId,
      venueId: params.venueId,
      status: {
        in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED", "RELEASED", "NO_SHOW"],
      },
      startAt: { lt: params.to },
      endAt: { gt: params.from },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      club: { select: { name: true } },
      block: { select: { title: true } },
      orderItem: { select: { orderId: true } },
    },
    orderBy: { startAt: "asc" },
  });
}

export function findBookingForAdmin(ctx: TenantContext, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, organisationId: ctx.organisationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      club: { select: { name: true } },
      block: { select: { title: true } },
      orderItem: { select: { orderId: true } },
      venue: { select: { timezone: true, slotMinutes: true } },
    },
  });
}

/** Kunde für manuelle Belegung: muss im Mandanten eine Membership haben. */
export function findCustomerByEmail(ctx: TenantContext, email: string) {
  return prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      memberships: { some: { organisationId: ctx.organisationId } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      billingStreet: true,
      billingZip: true,
      billingCity: true,
      billingCountry: true,
    },
  });
}

export type ManualBookingData = {
  venueId: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
  usageType: "KOMMERZIELL" | "VEREIN" | "LIGA" | "INTERN";
  userId?: string | null;
  label?: string | null;
  note?: string | null;
  priceCents?: number | null;
};

/** Kostenlose/interne manuelle Belegung (ohne Bestellung). */
export async function createManualBookingRow(
  ctx: TenantContext,
  data: ManualBookingData,
): Promise<{ ok: true; bookingId: string } | { ok: false; conflict: true }> {
  try {
    const booking = await prisma.booking.create({
      data: {
        organisationId: ctx.organisationId,
        venueId: data.venueId,
        courtId: data.courtId,
        startAt: data.startAt,
        endAt: data.endAt,
        kind: "CUSTOMER",
        status: "CONFIRMED",
        usageType: data.usageType,
        source: "ADMIN",
        userId: data.userId ?? null,
        label: data.label ?? null,
        note: data.note ?? null,
        priceCents: data.priceCents ?? null,
        confirmedAt: new Date(),
      },
    });
    return { ok: true, bookingId: booking.id };
  } catch (error) {
    if (isExclusionViolation(error)) return { ok: false, conflict: true };
    throw error;
  }
}

export type ManualPaidOrderInput = {
  venueId: string;
  legalEntityId: string;
  courtId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  description: string;
  taxRateBp: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  priceBreakdown: Prisma.InputJsonValue;
  billingSnapshot: Prisma.InputJsonValue;
  /** G7: manuelle Zahlarten */
  paymentMethod: "cash" | "transfer";
  termsVersion: string;
  actorUserId: string;
};

/** Manuelle Belegung mit Bestellung: Order gilt sofort als bezahlt
 *  (Payment MANUAL), Buchung ist CONFIRMED. Rechnung erzeugt der Service
 *  danach über den bestehenden Rechnungsweg. */
export async function createManualPaidOrderTx(
  ctx: TenantContext,
  input: ManualPaidOrderInput,
): Promise<
  | { ok: true; orderId: string; orderNumber: string; bookingId: string }
  | { ok: false; conflict: true }
> {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          organisationId: ctx.organisationId,
          venueId: input.venueId,
          userId: input.userId,
          legalEntityId: input.legalEntityId,
          number: orderNumber(),
          status: "PAID",
          currency: "EUR",
          subtotalCents: input.netCents,
          taxCents: input.taxCents,
          totalCents: input.grossCents,
          paymentMethodType: input.paymentMethod,
          billingSnapshot: input.billingSnapshot,
          termsVersion: input.termsVersion,
          paidAt: new Date(),
        },
      });
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productType: "SINGLE_BOOKING",
          description: input.description,
          servicePeriodFrom: input.startAt,
          servicePeriodTo: input.endAt,
          quantity: 1,
          unitCents: input.grossCents,
          taxRateBp: input.taxRateBp,
          netCents: input.netCents,
          taxCents: input.taxCents,
          grossCents: input.grossCents,
          priceBreakdown: input.priceBreakdown,
        },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "MANUAL",
          providerRef: `manual-${order.number}`,
          method: input.paymentMethod,
          amountCents: input.grossCents,
          status: "SUCCEEDED",
          receivedAt: new Date(),
        },
      });
      const booking = await tx.booking.create({
        data: {
          organisationId: ctx.organisationId,
          venueId: input.venueId,
          courtId: input.courtId,
          startAt: input.startAt,
          endAt: input.endAt,
          kind: "CUSTOMER",
          status: "CONFIRMED",
          usageType: "KOMMERZIELL",
          source: "ADMIN",
          userId: input.userId,
          orderItemId: item.id,
          priceCents: input.grossCents,
          confirmedAt: new Date(),
        },
      });
      return {
        ok: true as const,
        orderId: order.id,
        orderNumber: order.number,
        bookingId: booking.id,
      };
    });
  } catch (error) {
    if (isExclusionViolation(error)) return { ok: false, conflict: true };
    throw error;
  }
}

/** Verschieben: neue Zeit/Platz mit unveränderter Dauer der Zeile. */
export async function moveBookingRow(
  ctx: TenantContext,
  params: { bookingId: string; courtId: string; startAt: Date; endAt: Date },
): Promise<{ ok: true } | { ok: false; conflict: true } | { ok: false; notFound: true }> {
  try {
    const res = await prisma.booking.updateMany({
      where: {
        id: params.bookingId,
        organisationId: ctx.organisationId,
        status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
      },
      data: {
        courtId: params.courtId,
        startAt: params.startAt,
        endAt: params.endAt,
      },
    });
    if (res.count === 0) return { ok: false, notFound: true };
    return { ok: true };
  } catch (error) {
    if (isExclusionViolation(error)) return { ok: false, conflict: true };
    throw error;
  }
}

export async function setBookingStatusAdmin(
  ctx: TenantContext,
  params: {
    bookingId: string;
    from: readonly ("HOLD" | "PENDING_PAYMENT" | "CONFIRMED")[];
    to: "CANCELLED" | "NO_SHOW";
    actorUserId: string;
    reason?: string;
  },
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: {
      id: params.bookingId,
      organisationId: ctx.organisationId,
      status: { in: [...params.from] },
    },
    data:
      params.to === "CANCELLED"
        ? {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledByUserId: params.actorUserId,
            cancelReason: params.reason ?? "ADMIN",
          }
        : { status: "NO_SHOW" },
  });
  return res.count > 0;
}
