import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Guthaben (Ticket M1, S3): Kontostand aus dem append-only CreditLedger
// und Vollverrechnung einer offenen Bestellung. Teilverrechnung mit
// Stripe-Rest ist bewusst nicht Teil von v1 (docs/04_ENTSCHEIDUNGEN.md).

export async function getCreditBalance(
  ctx: TenantContext,
  userId: string,
): Promise<number> {
  const result = await prisma.creditLedger.aggregate({
    where: {
      organisationId: ctx.organisationId,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    _sum: { deltaCents: true },
  });
  return result._sum.deltaCents ?? 0;
}

export type CreditPaymentResult =
  | {
      ok: true;
      order: Prisma.OrderGetPayload<{
        include: { user: true; items: true };
      }>;
      remainingCents: number;
    }
  | { ok: false; reason: "NOT_FOUND" | "INSUFFICIENT"; balanceCents: number };

/** Bestellung vollständig mit Guthaben bezahlen – atomar:
 *  Advisory-Lock je Nutzer verhindert paralleles Doppel-Einlösen,
 *  Abbuchung, Payment (MANUAL/credit), Order → PAID und Erfüllung
 *  (Bookings CONFIRMED, Subscription ACTIVE) in einer Transaktion. */
export async function payOrderWithCreditTx(
  ctx: TenantContext,
  params: { orderId: string; userId: string },
): Promise<CreditPaymentResult> {
  return prisma.$transaction(async (tx) => {
    // Ein Lock pro (Org, Nutzer): serialisiert konkurrierende Einlösungen.
    // $executeRaw, weil die Funktion void liefert (nicht deserialisierbar).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.organisationId + ":" + params.userId}, 0))`;

    const order = await tx.order.findFirst({
      where: {
        id: params.orderId,
        organisationId: ctx.organisationId,
        userId: params.userId,
        status: "AWAITING_PAYMENT",
      },
      include: { user: true, items: true },
    });
    if (!order) {
      return { ok: false as const, reason: "NOT_FOUND" as const, balanceCents: 0 };
    }

    const sum = await tx.creditLedger.aggregate({
      where: {
        organisationId: ctx.organisationId,
        userId: params.userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      _sum: { deltaCents: true },
    });
    const balanceCents = sum._sum.deltaCents ?? 0;
    if (balanceCents < order.totalCents) {
      return { ok: false as const, reason: "INSUFFICIENT" as const, balanceCents };
    }

    await tx.creditLedger.create({
      data: {
        organisationId: ctx.organisationId,
        userId: params.userId,
        deltaCents: -order.totalCents,
        reason: `Verrechnung Bestellung ${order.number}`,
        refType: "order",
        refId: order.id,
      },
    });
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "MANUAL",
        providerRef: `credit-${order.number}`,
        method: "credit",
        amountCents: order.totalCents,
        status: "SUCCEEDED",
        receivedAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethodType: "credit",
      },
    });

    const itemIds = order.items.map((i) => i.id);
    await tx.booking.updateMany({
      where: {
        orderItemId: { in: itemIds },
        status: { in: ["HOLD", "PENDING_PAYMENT"] },
      },
      data: { status: "CONFIRMED", confirmedAt: new Date(), holdExpiresAt: null },
    });
    await tx.subscription.updateMany({
      where: { orderItemId: { in: itemIds }, status: "PENDING" },
      data: { status: "ACTIVE" },
    });

    return {
      ok: true as const,
      order: { ...order, status: "PAID" as const },
      remainingCents: balanceCents - order.totalCents,
    };
  });
}
