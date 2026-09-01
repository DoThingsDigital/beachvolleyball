import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Massenstorno (Ticket 5.6, I3): DB-Zugriffe.

/** Betroffene Kundenbelegungen im Zeitraum (CUSTOMER + SUBSCRIPTION;
 *  Sperren-Termine sind kein Kundengeschäft und bleiben außen vor). */
export function findAffectedCustomerBookings(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date; courtIds?: string[] },
) {
  return prisma.booking.findMany({
    where: {
      organisationId: ctx.organisationId,
      venueId: params.venueId,
      kind: { in: ["CUSTOMER", "SUBSCRIPTION"] },
      status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
      startAt: { lt: params.to },
      endAt: { gt: params.from },
      ...(params.courtIds && params.courtIds.length > 0
        ? { courtId: { in: params.courtIds } }
        : {}),
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      court: { select: { name: true } },
      orderItem: {
        select: {
          orderId: true,
          order: { select: { status: true } },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

/** Einzelnen Termin stornieren (Guard auf aktiven Status, atomar). */
export async function cancelAffectedBooking(
  ctx: TenantContext,
  bookingId: string,
  actorUserId: string,
  reason: string,
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      organisationId: ctx.organisationId,
      status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: actorUserId,
      cancelReason: reason,
    },
  });
  return res.count > 0;
}
