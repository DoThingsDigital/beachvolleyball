import { randomBytes } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Transaktionale Order-Erstellung für einen Dauerplatz (Ticket 2.3, G1/D3):
// Order + OrderItem + Subscription (PENDING) + alle Termine als HOLD-Bookings
// in EINER Transaktion. Schlägt das Exclusion-Constraint zu (23P01), rollt
// alles zurück – der Slot ist vergeben (kein Bug, Invariante 4).

export type SubscriptionOrderInput = {
  userId: string;
  venueId: string;
  legalEntityId: string;
  seasonId: string;
  courtId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  currency: string;
  termsVersion: string;
  holdMinutes: number;
  description: string;
  servicePeriodFrom: Date;
  servicePeriodTo: Date;
  taxRateBp: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  perOccurrenceCents: number;
  lastOccurrenceCents: number;
  priceBreakdown: Prisma.InputJsonValue;
  billingSnapshot: Prisma.InputJsonValue;
  occurrences: { date: string; startAt: Date; endAt: Date }[];
};

export function isExclusionViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2010 = raw query failed; Treiber-Fehlercode 23P01 = exclusion_violation
    const meta = JSON.stringify(error.meta ?? {});
    return error.code === "P2004" || meta.includes("23P01") || meta.includes("exclusion");
  }
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: string }).code === "23P01";
  }
  if (error instanceof Error) {
    return error.message.includes("23P01") || error.message.includes("booking_no_overlap");
  }
  return false;
}

function orderNumber(): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `ORD-${ymd}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createSubscriptionOrderTx(
  ctx: TenantContext,
  input: SubscriptionOrderInput,
) {
  const { organisationId } = ctx;
  const holdExpiresAt = new Date(Date.now() + input.holdMinutes * 60_000);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        organisationId,
        venueId: input.venueId,
        userId: input.userId,
        legalEntityId: input.legalEntityId,
        number: orderNumber(),
        // Checkout startet unmittelbar danach (Ticket 2.4)
        status: "AWAITING_PAYMENT",
        currency: input.currency,
        subtotalCents: input.netCents,
        taxCents: input.taxCents,
        totalCents: input.grossCents,
        billingSnapshot: input.billingSnapshot,
        termsVersion: input.termsVersion,
      },
    });

    const item = await tx.orderItem.create({
      data: {
        orderId: order.id,
        productType: "SUBSCRIPTION",
        description: input.description,
        servicePeriodFrom: input.servicePeriodFrom,
        servicePeriodTo: input.servicePeriodTo,
        quantity: 1,
        unitCents: input.grossCents,
        taxRateBp: input.taxRateBp,
        netCents: input.netCents,
        taxCents: input.taxCents,
        grossCents: input.grossCents,
        priceBreakdown: input.priceBreakdown,
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        organisationId,
        venueId: input.venueId,
        userId: input.userId,
        seasonId: input.seasonId,
        courtId: input.courtId,
        weekday: input.weekday,
        startTime: input.startTime,
        durationMin: input.durationMin,
        dateFrom: input.occurrences[0]!.startAt,
        dateTo: input.occurrences[input.occurrences.length - 1]!.endAt,
        pricePerOccurrenceCents: input.perOccurrenceCents,
        totalCents: input.grossCents,
        status: "PENDING",
        orderItemId: item.id,
      },
    });

    await tx.booking.createMany({
      data: input.occurrences.map((occ, i) => ({
        organisationId,
        venueId: input.venueId,
        courtId: input.courtId,
        startAt: occ.startAt,
        endAt: occ.endAt,
        kind: "SUBSCRIPTION" as const,
        status: "HOLD" as const,
        usageType: "KOMMERZIELL" as const,
        source: "ONLINE" as const,
        userId: input.userId,
        subscriptionId: subscription.id,
        orderItemId: item.id,
        priceCents:
          i === input.occurrences.length - 1
            ? input.lastOccurrenceCents
            : input.perOccurrenceCents,
        holdExpiresAt,
      })),
    });

    return { orderId: order.id, orderNumber: order.number, subscriptionId: subscription.id };
  });
}

// --- Hold-Ablauf (Cron, idempotent) ----------------------------------------

export async function expireHoldsTx(now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    // Abgelaufene Holds (Statusautomat: HOLD → EXPIRED)
    const expired = await tx.booking.updateMany({
      where: { status: "HOLD", holdExpiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    });

    // Subscriptions ohne aktive Holds und noch PENDING → CANCELLED,
    // zugehörige Orders AWAITING_PAYMENT → CANCELLED.
    const stale = await tx.subscription.findMany({
      where: {
        status: "PENDING",
        bookings: { none: { status: "HOLD" } },
        // mindestens eine expired-Buchung → stammt aus einem Hold-Lauf
        AND: { bookings: { some: { status: "EXPIRED" } } },
      },
      select: { id: true, orderItemId: true },
    });

    let cancelledOrders = 0;
    for (const sub of stale) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: "HOLD_EXPIRED" },
      });
      if (sub.orderItemId) {
        const item = await tx.orderItem.findUnique({
          where: { id: sub.orderItemId },
          select: { orderId: true },
        });
        if (item) {
          const res = await tx.order.updateMany({
            where: { id: item.orderId, status: "AWAITING_PAYMENT" },
            data: { status: "CANCELLED" },
          });
          cancelledOrders += res.count;
        }
      }
    }

    return { expiredBookings: expired.count, cancelledSubscriptions: stale.length, cancelledOrders };
  });
}
