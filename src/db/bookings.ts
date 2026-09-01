import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Kundensicht auf Buchungen (Ticket 4.4, D5/D6).

export function findUpcomingBookingsForUser(ctx: TenantContext, userId: string) {
  return prisma.booking.findMany({
    where: {
      organisationId: ctx.organisationId,
      userId,
      startAt: { gt: new Date() },
      status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
    },
    include: {
      court: { select: { name: true } },
      venue: { select: { name: true, cancelHours: true } },
      orderItem: { select: { orderId: true } },
    },
    orderBy: { startAt: "asc" },
    take: 50,
  });
}

export function findBookingForCustomerCancel(
  ctx: TenantContext,
  bookingId: string,
  userId: string,
) {
  return prisma.booking.findFirst({
    where: { id: bookingId, organisationId: ctx.organisationId, userId },
    include: {
      court: { select: { name: true } },
      venue: {
        select: {
          name: true,
          cancelHours: true,
          cancelRefundMode: true,
          timezone: true,
        },
      },
      user: { select: { email: true } },
      orderItem: {
        select: { orderId: true, order: { select: { status: true } } },
      },
    },
  });
}

/** CONFIRMED → CANCELLED, konditional (Statusautomat). */
export async function cancelBookingRecord(
  bookingId: string,
  cancelledByUserId: string,
  reason: string,
): Promise<boolean> {
  const result = await prisma.booking.updateMany({
    where: { id: bookingId, status: "CONFIRMED" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId,
      cancelReason: reason,
    },
  });
  return result.count > 0;
}

export function createCreditEntry(
  ctx: TenantContext,
  entry: {
    userId: string;
    deltaCents: number;
    reason: string;
    refType?: string;
    refId?: string;
  },
) {
  return prisma.creditLedger.create({
    data: { ...entry, organisationId: ctx.organisationId },
  });
}

/** Erinnerungs-Kandidaten (J2): bestätigte Termine im Fenster, für die noch
 *  keine Erinnerung verschickt wurde (Abgleich über EmailLog). */
export async function findReminderCandidates(windowFrom: Date, windowTo: Date) {
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: windowFrom, lt: windowTo },
      userId: { not: null },
    },
    include: {
      court: { select: { name: true } },
      venue: {
        select: { name: true, street: true, zip: true, city: true },
      },
      user: { select: { id: true, email: true } },
    },
  });
  if (bookings.length === 0) return [];

  const sent = await prisma.emailLog.findMany({
    where: {
      refType: "booking-reminder",
      refId: { in: bookings.map((b) => b.id) },
    },
    select: { refId: true },
  });
  const sentIds = new Set(sent.map((s) => s.refId));
  return bookings.filter((b) => !sentIds.has(b.id));
}
