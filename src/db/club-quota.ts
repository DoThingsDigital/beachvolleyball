import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Vereins-Kontingent (Ticket 5.3, E4): Sicht und Aktionen des Vereins-Admins
// auf die materialisierten VEREIN-Belegungen seines Vereins.

export function findUpcomingQuotaBookings(ctx: TenantContext, clubId: string) {
  return prisma.booking.findMany({
    where: {
      organisationId: ctx.organisationId,
      clubId,
      kind: "BLOCK",
      status: { in: ["CONFIRMED", "RELEASED"] },
      startAt: { gte: new Date() },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      clubConfirmedAt: true,
      label: true,
      court: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
    take: 60,
  });
}

/** Termin bestätigen: bleibt beim Verein, der Freigabe-Cron fasst ihn
 *  nicht mehr an. */
export async function confirmQuotaBooking(
  ctx: TenantContext,
  clubId: string,
  bookingId: string,
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      organisationId: ctx.organisationId,
      clubId,
      kind: "BLOCK",
      status: "CONFIRMED",
    },
    data: { clubConfirmedAt: new Date() },
  });
  return res.count > 0;
}

/** Termin sofort freigeben (CONFIRMED → RELEASED, Zustandsautomat). */
export async function releaseQuotaBookingByClub(
  ctx: TenantContext,
  clubId: string,
  bookingId: string,
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      organisationId: ctx.organisationId,
      clubId,
      kind: "BLOCK",
      status: "CONFIRMED",
    },
    data: { status: "RELEASED", clubConfirmedAt: null },
  });
  return res.count > 0;
}

/** Trainingsgruppe/Beschriftung setzen (leer = entfernen). */
export async function setQuotaBookingLabel(
  ctx: TenantContext,
  clubId: string,
  bookingId: string,
  label: string | null,
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      organisationId: ctx.organisationId,
      clubId,
      kind: "BLOCK",
      status: { in: ["CONFIRMED", "RELEASED"] },
    },
    data: { label },
  });
  return res.count > 0;
}

/** Freigegebenen Slot finden, den eine neue Buchung weiterverkauft (E3):
 *  gleiche Platzzeit-Überlappung mit einer RELEASED-Kontingent-Belegung. */
export function findReleasedQuotaForSlot(
  ctx: TenantContext,
  params: { courtId: string; startAt: Date; endAt: Date },
) {
  return prisma.booking.findFirst({
    where: {
      organisationId: ctx.organisationId,
      courtId: params.courtId,
      kind: "BLOCK",
      status: "RELEASED",
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
}
