import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import {
  blockToOccupations,
  computeWeeklyAvailability,
  subscriptionToOccupation,
  type AvailableSlot,
} from "@/src/domain/subscription-availability";

// Use-Case (Ticket 2.1): freie Dauerplatz-Kombinationen einer Saison.
// Reihenfolge/Statusprüfung des Verkaufs (PRESALE/ACTIVE) erzwingt die
// Order-Erstellung (Ticket 2.3); hier geht es um die Anzeige.

export type SubscriptionAvailability = {
  venue: { id: string; name: string; slotMinutes: number };
  season: { id: string; name: string; status: string };
  courts: { id: string; name: string; courtGroup: string | null }[];
  durationsMin: number[];
  slots: AvailableSlot[];
};

export async function getSubscriptionAvailability(
  ctx: TenantContext,
  params: { venueId: string; seasonId: string },
): Promise<SubscriptionAvailability> {
  const repos = createRepositories(ctx);

  const venue = await repos.venues.findById(params.venueId);
  if (!venue) {
    throw new DomainError("INVALID_PERIOD", "Standort nicht gefunden.");
  }
  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const season = seasons.find((s) => s.id === params.seasonId);
  if (!season) {
    throw new DomainError("INVALID_PERIOD", "Saison nicht gefunden.");
  }

  const [courts, subscriptions, blocks] = await Promise.all([
    repos.courts.findManyForVenue(venue.id),
    repos.subscriptions.findBlockingForSeason(season.id),
    repos.blocks.findManyForVenue(venue.id),
  ]);

  const occupations = [
    ...subscriptions.map(subscriptionToOccupation),
    ...blocks.flatMap((b) => blockToOccupations(b, venue.timezone)),
  ];

  const durationsMin: number[] = [];
  for (
    let d = venue.minDurationMin;
    d <= venue.maxDurationMin;
    d += venue.slotMinutes
  ) {
    durationsMin.push(d);
  }

  const slots = computeWeeklyAvailability({
    slotMinutes: venue.slotMinutes,
    openingHours: venue.openingHours as Record<string, [string, string][]>,
    durationsMin,
    courtIds: courts.map((c) => c.id),
    occupations,
  });

  return {
    venue: { id: venue.id, name: venue.name, slotMinutes: venue.slotMinutes },
    season: { id: season.id, name: season.name, status: season.status },
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      courtGroup: c.courtGroup,
    })),
    durationsMin,
    slots,
  };
}
