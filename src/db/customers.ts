import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Admin-Kundensicht (Ticket 3.5, K2): Kunden = Nutzer mit Membership im
// Mandanten. User ist global; der Zugriff läuft immer über die Membership.

export function findCustomers(ctx: TenantContext, query?: string) {
  return prisma.membership.findMany({
    where: {
      organisationId: ctx.organisationId,
      ...(query
        ? {
            user: {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          sepaBlocked: true,
          anonymizedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function findCustomerDetail(ctx: TenantContext, userId: string) {
  return prisma.membership.findUnique({
    where: {
      userId_organisationId: {
        userId,
        organisationId: ctx.organisationId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          billingStreet: true,
          billingZip: true,
          billingCity: true,
          billingCountry: true,
          sepaBlocked: true,
          notes: true,
          termsAcceptedVersion: true,
          anonymizedAt: true,
          createdAt: true,
          sepaMandates: {
            select: {
              id: true,
              mandateRef: true,
              ibanLast4: true,
              status: true,
              signedAt: true,
            },
          },
          subscriptions: {
            where: { organisationId: ctx.organisationId },
            include: {
              court: { select: { name: true } },
              season: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          orders: {
            where: { organisationId: ctx.organisationId },
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 25,
          },
        },
      },
    },
  });
}

export function updateCustomerNotes(userId: string, notes: string | null) {
  return prisma.user.update({ where: { id: userId }, data: { notes } });
}

export function findSubscriptionForCancel(
  ctx: TenantContext,
  subscriptionId: string,
) {
  return prisma.subscription.findFirst({
    where: { id: subscriptionId, organisationId: ctx.organisationId },
    include: { orderItem: { select: { orderId: true } } },
  });
}

/** Storniert zukünftige bestätigte Termine; liefert Anzahl und Erstattungs-
 *  summe (Summe der priceCents – berücksichtigt den Rundungsrest exakt). */
export async function cancelFutureSubscriptionBookings(
  subscriptionId: string,
  from: Date,
  reason: string,
) {
  const future = await prisma.booking.findMany({
    where: {
      subscriptionId,
      status: "CONFIRMED",
      startAt: { gt: from },
    },
    select: { id: true, priceCents: true },
  });
  if (future.length === 0) return { cancelledCount: 0, refundCents: 0 };

  await prisma.booking.updateMany({
    where: { id: { in: future.map((b) => b.id) } },
    data: {
      status: "CANCELLED",
      cancelledAt: from,
      cancelReason: reason,
    },
  });
  return {
    cancelledCount: future.length,
    refundCents: future.reduce((sum, b) => sum + (b.priceCents ?? 0), 0),
  };
}

export function cancelSubscriptionRecord(
  subscriptionId: string,
  reason: string,
) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
}
