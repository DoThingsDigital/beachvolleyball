import { prisma } from "./client";
import { isExclusionViolation } from "./orders";
import type { TenantContext } from "./tenant";

// Sperren-Materialisierung (Ticket 5.1): DB-Zugriffe für den Block-Service.

/** Grund-Kennung regelgetriebener Stornierungen: nur solche Zeilen dürfen
 *  bei einer erneuten Materialisierung wieder neu entstehen. Manuell
 *  stornierte Termine bleiben Tombstones. */
export const BLOCK_RULE_CANCEL_REASON = "BLOCK_REGEL";

/** Materialisierungsfenster: von jetzt bis zum Ende der letzten nicht
 *  archivierten Saison des Standorts (Saisonhorizont). */
export async function materializationWindow(
  ctx: TenantContext,
  venueId: string,
): Promise<{ from: Date; to: Date } | null> {
  const seasons = await prisma.season.findMany({
    where: {
      organisationId: ctx.organisationId,
      venueId,
      status: { in: ["PRESALE", "ACTIVE"] },
    },
    select: { startDate: true, endDate: true },
  });
  if (seasons.length === 0) return null;
  const from = new Date(
    Math.min(...seasons.map((s) => s.startDate.getTime())),
  );
  const to = new Date(Math.max(...seasons.map((s) => s.endDate.getTime())));
  return { from, to };
}

export function findMaterializedBookings(
  ctx: TenantContext,
  blockId: string,
  from: Date,
) {
  return prisma.booking.findMany({
    where: {
      organisationId: ctx.organisationId,
      blockId,
      startAt: { gte: from },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      cancelReason: true,
    },
  });
}

/** Storniert regelgetrieben – nur CONFIRMED: RELEASED bleibt laut
 *  Zustandsautomat RELEASED (blockiert ohnehin nicht mehr). */
export async function cancelBlockBookings(
  ctx: TenantContext,
  ids: string[],
  actorUserId: string | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await prisma.booking.updateMany({
    where: {
      id: { in: ids },
      organisationId: ctx.organisationId,
      status: "CONFIRMED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: actorUserId,
      cancelReason: BLOCK_RULE_CANCEL_REASON,
    },
  });
  return res.count;
}

/** Mitglieder-Buchungsfenster eines Standorts (E-005). */
export function findMemberWindowBlocks(ctx: TenantContext, venueId: string) {
  return prisma.block.findMany({
    where: {
      organisationId: ctx.organisationId,
      venueId,
      type: "VEREIN",
      memberSelfBooking: true,
    },
    select: {
      courtId: true,
      startAt: true,
      endAt: true,
      rrule: true,
      clubId: true,
      releaseHoursBefore: true,
    },
  });
}

/** Anzahl zukünftiger aktiver Termine je Block (Admin-Liste). */
export async function countFutureBlockBookings(
  ctx: TenantContext,
  blockIds: string[],
): Promise<Map<string, number>> {
  if (blockIds.length === 0) return new Map();
  const rows = await prisma.booking.groupBy({
    by: ["blockId"],
    where: {
      organisationId: ctx.organisationId,
      blockId: { in: blockIds },
      status: { in: ["CONFIRMED", "RELEASED"] },
      startAt: { gte: new Date() },
    },
    _count: { _all: true },
  });
  return new Map(
    rows
      .filter((r): r is typeof r & { blockId: string } => r.blockId !== null)
      .map((r) => [r.blockId, r._count._all]),
  );
}

export async function createBlockBooking(
  ctx: TenantContext,
  data: {
    venueId: string;
    courtId: string;
    blockId: string;
    clubId: string | null;
    startAt: Date;
    endAt: Date;
    usageType: "VEREIN" | "LIGA" | "INTERN";
  },
): Promise<{ ok: true } | { ok: false; conflict: true }> {
  try {
    await prisma.booking.create({
      data: {
        organisationId: ctx.organisationId,
        venueId: data.venueId,
        courtId: data.courtId,
        blockId: data.blockId,
        clubId: data.clubId,
        startAt: data.startAt,
        endAt: data.endAt,
        kind: "BLOCK",
        status: "CONFIRMED",
        usageType: data.usageType,
        source: "BLOCK",
        confirmedAt: new Date(),
      },
    });
    return { ok: true };
  } catch (error) {
    if (isExclusionViolation(error)) return { ok: false, conflict: true };
    throw error;
  }
}
