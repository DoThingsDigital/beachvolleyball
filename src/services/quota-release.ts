import { prisma } from "@/src/db/client";

import { invalidateOccupancyCache } from "./occupancy";

// Kontingent-Freigabe (Ticket 5.2, E3): VEREIN-Belegungen, die der Verein
// nicht bestätigt hat, werden `releaseHoursBefore` (Block-Override, sonst
// Venue-Default) vor Beginn freigegeben (RELEASED) und damit kommerziell
// buchbar. Läuft mandantenübergreifend per Cron; idempotent.

export async function releaseUnconfirmedQuota(
  now: Date = new Date(),
): Promise<{ candidates: number; released: number }> {
  // Kandidaten: unbestätigte zukünftige VEREIN-Kontingent-Belegungen.
  // Obergrenze der Vorlauffenster großzügig vorfiltern (max. 14 Tage),
  // die exakte Frist entscheidet pro Zeile der Block/Venue-Wert.
  const horizonMs = 14 * 24 * 60 * 60 * 1000;
  const candidates = await prisma.booking.findMany({
    where: {
      kind: "BLOCK",
      usageType: "VEREIN",
      status: "CONFIRMED",
      clubConfirmedAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + horizonMs) },
    },
    select: {
      id: true,
      startAt: true,
      block: { select: { releaseHoursBefore: true } },
      venue: { select: { releaseHoursBefore: true } },
    },
  });

  const due = candidates.filter((b) => {
    const hours = b.block?.releaseHoursBefore ?? b.venue.releaseHoursBefore;
    return b.startAt.getTime() <= now.getTime() + hours * 60 * 60 * 1000;
  });

  if (due.length === 0) {
    return { candidates: candidates.length, released: 0 };
  }

  // Guard auf CONFIRMED macht den Übergang CONFIRMED → RELEASED atomar
  // (Zustandsautomat; parallele Läufe releasen nie doppelt).
  const res = await prisma.booking.updateMany({
    where: { id: { in: due.map((b) => b.id) }, status: "CONFIRMED" },
    data: { status: "RELEASED" },
  });

  if (res.count > 0) invalidateOccupancyCache();
  return { candidates: candidates.length, released: res.count };
}
