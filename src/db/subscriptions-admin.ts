import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Dauerplatz-Übersicht (Ticket 5.5, K5): Saison-Raster + Termin-Zählung.

export function findSubscriptionsForSeasonAdmin(
  ctx: TenantContext,
  seasonId: string,
) {
  return prisma.subscription.findMany({
    where: { organisationId: ctx.organisationId, seasonId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      court: { select: { id: true, name: true } },
    },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  });
}

/** Termin-Zählung je Dauerplatz und Status (Soll/Ist-Abgleich für die
 *  Konfliktanzeige: fehlende Termine = Lücken durch Storno/Kollision). */
export async function countSubscriptionBookings(
  ctx: TenantContext,
  subscriptionIds: string[],
): Promise<Map<string, { confirmed: number; cancelled: number }>> {
  if (subscriptionIds.length === 0) return new Map();
  const rows = await prisma.booking.groupBy({
    by: ["subscriptionId", "status"],
    where: {
      organisationId: ctx.organisationId,
      subscriptionId: { in: subscriptionIds },
    },
    _count: { _all: true },
  });
  const result = new Map<string, { confirmed: number; cancelled: number }>();
  for (const row of rows) {
    if (!row.subscriptionId) continue;
    const entry = result.get(row.subscriptionId) ?? {
      confirmed: 0,
      cancelled: 0,
    };
    if (row.status === "CONFIRMED") entry.confirmed += row._count._all;
    if (row.status === "CANCELLED") entry.cancelled += row._count._all;
    result.set(row.subscriptionId, entry);
  }
  return result;
}
