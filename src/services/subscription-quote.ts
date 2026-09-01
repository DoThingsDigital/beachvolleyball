import { TZDate } from "@date-fns/tz";

import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import {
  computePrice,
  computeSubscriptionPrice,
  listOccurrences,
  type Occurrence,
} from "@/src/domain/pricing";

// Preisangebot für einen Dauerplatz (Ticket 2.2; Wiederverwendung in 2.3
// beim Anlegen der Bestellung – Preise entstehen nur hier, nie im Client).

export type SubscriptionQuote = {
  occurrences: Occurrence[];
  occurrenceCount: number;
  grossPerOccurrenceCents: number;
  totalCents: number;
  perOccurrenceCents: number;
  lastOccurrenceCents: number;
  discountCents: number;
  discountBp: number;
};

function instantToLocalDate(instant: Date, timezone: string): string {
  const tz = new TZDate(instant.getTime(), timezone);
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getSubscriptionQuote(
  ctx: TenantContext,
  params: {
    venueId: string;
    seasonId: string;
    courtId: string;
    weekday: number;
    startTime: string;
    durationMin: number;
    isMember: boolean;
  },
): Promise<SubscriptionQuote> {
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
  const rules = await repos.priceRules.findManyForSeason(season.id);

  // Saisonfenster als lokale Kalendertage; endDate ist exklusiv gespeichert
  // (00:00 des Folgetags), daher 1 ms zurück für den letzten Spieltag.
  const dateFrom = instantToLocalDate(season.startDate, venue.timezone);
  const dateTo = instantToLocalDate(
    new Date(season.endDate.getTime() - 1),
    venue.timezone,
  );

  const occurrences = listOccurrences({
    timezone: venue.timezone,
    weekday: params.weekday,
    startTime: params.startTime,
    durationMin: params.durationMin,
    dateFrom,
    dateTo,
    excludedDates: (venue.closedDates as string[]) ?? [],
  });
  if (occurrences.length === 0) {
    throw new DomainError("INVALID_PERIOD", "Keine Termine im Saisonzeitraum.");
  }

  // Preis je Termin ist konstant (fester Wochentag + lokale Uhrzeit);
  // berechnet am ersten Termin, DST-sicher über lokale Zeit.
  const first = occurrences[0]!;
  const { grossCents } = computePrice({
    slotMinutes: venue.slotMinutes,
    timezone: venue.timezone,
    rules,
    courtId: params.courtId,
    startAt: first.startAt,
    endAt: first.endAt,
    isMember: params.isMember,
  });

  const price = computeSubscriptionPrice({
    occurrenceGrossCents: occurrences.map(() => grossCents),
    discountBp: season.subscriptionDiscountBp,
  });

  return {
    occurrences,
    occurrenceCount: occurrences.length,
    grossPerOccurrenceCents: grossCents,
    totalCents: price.totalCents,
    perOccurrenceCents: price.perOccurrenceCents,
    lastOccurrenceCents: price.lastOccurrenceCents,
    discountCents: price.discountCents,
    discountBp: season.subscriptionDiscountBp,
  };
}
