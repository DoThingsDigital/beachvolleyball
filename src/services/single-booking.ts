import { TZDate } from "@date-fns/tz";

import { formatDate, formatWeekday } from "@/lib/format";
import {
  createSingleBookingOrderTx,
  isExclusionViolation,
} from "@/src/db/orders";
import { createRepositories } from "@/src/db/repositories";
import { findProfile } from "@/src/db/users";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { computePrice, splitGross } from "@/src/domain/pricing";
import { isoWeekdayOfDate } from "@/src/domain/week-occupancy";
import { invalidateOccupancyCache } from "./occupancy";

// Einzelbuchung (Tickets 4.2/4.3, D2/D3): Preisvorschau und Order+Hold.
// Alle Regeln kommen aus der Venue-Konfiguration (Öffnungszeiten,
// Schließtage, Vorlauf, Horizont, Raster) – nichts ist fest programmiert.

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SingleBookingQuote = {
  startAt: Date;
  endAt: Date;
  grossCents: number;
  netCents: number;
  taxCents: number;
  taxRateBp: number;
  description: string;
  seasonId: string;
  legalEntityId: string;
  termsVersion: string;
  holdMinutes: number;
  currency: string;
  courtName: string;
};

export async function getSingleBookingQuote(
  ctx: TenantContext,
  params: {
    venueId: string;
    courtId: string;
    /** "YYYY-MM-DD" lokal */
    date: string;
    /** "HH:MM" lokal */
    time: string;
    durationMin: number;
    isMember: boolean;
    now?: Date;
  },
): Promise<SingleBookingQuote> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const courts = await repos.courts.findManyForVenue(venue.id);
  const court = courts.find((c) => c.id === params.courtId);
  if (!court) throw new DomainError("NOT_FOUND", "Platz nicht gefunden.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || !/^\d{2}:\d{2}$/.test(params.time)) {
    throw new DomainError("INVALID_PERIOD", "Ungültige Auswahl.");
  }
  if (
    params.durationMin < venue.minDurationMin ||
    params.durationMin > venue.maxDurationMin ||
    params.durationMin % venue.slotMinutes !== 0
  ) {
    throw new DomainError("INVALID_PERIOD", "Ungültige Dauer.");
  }

  // Schließtage
  const closedDates = (venue.closedDates as string[]) ?? [];
  if (closedDates.includes(params.date)) {
    throw new DomainError("OUTSIDE_OPENING_HOURS", "Der Standort ist an diesem Tag geschlossen.");
  }

  // Öffnungsfenster des Wochentags muss [start, ende) komplett enthalten
  const weekday = isoWeekdayOfDate(params.date);
  const windows =
    (venue.openingHours as Record<string, [string, string][]>)[
      WEEKDAY_KEYS[weekday - 1]!
    ] ?? [];
  const [h, m] = params.time.split(":").map(Number);
  const startMin = (h ?? 0) * 60 + (m ?? 0);
  const endMin = startMin + params.durationMin;
  const inWindow = windows.some(([from, to]) => {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    return (fh! * 60 + fm!) <= startMin && endMin <= (th! * 60 + tm!);
  });
  if (!inWindow) {
    throw new DomainError(
      "OUTSIDE_OPENING_HOURS",
      "Die Auswahl liegt außerhalb der Öffnungszeiten.",
    );
  }

  const [y, mo, d] = params.date.split("-").map(Number);
  const startAt = new Date(new TZDate(y!, mo! - 1, d!, h!, m!, venue.timezone).getTime());
  const endAt = new Date(startAt.getTime() + params.durationMin * 60_000);

  // Vorlauf und Horizont (D2)
  const now = params.now ?? new Date();
  if (startAt.getTime() < now.getTime() + venue.leadTimeMin * 60_000) {
    throw new DomainError(
      "INVALID_PERIOD",
      `Buchungen sind nur mit mindestens ${venue.leadTimeMin} Minuten Vorlauf möglich.`,
    );
  }
  if (startAt.getTime() > now.getTime() + venue.horizonDays * DAY_MS) {
    throw new DomainError(
      "INVALID_PERIOD",
      `Buchungen sind maximal ${venue.horizonDays} Tage im Voraus möglich.`,
    );
  }

  // Saison mit geöffnetem Verkauf, die den Termin abdeckt (B3)
  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const season = seasons.find(
    (s) =>
      (s.status === "ACTIVE" || s.status === "PRESALE") &&
      s.startDate <= startAt &&
      startAt < s.endDate,
  );
  if (!season) {
    throw new DomainError("SEASON_NOT_BOOKABLE", "Für diesen Termin ist keine Buchung möglich.");
  }

  const rules = await repos.priceRules.findManyForSeason(season.id);
  const price = computePrice({
    slotMinutes: venue.slotMinutes,
    timezone: venue.timezone,
    rules,
    courtId: court.id,
    startAt,
    endAt,
    isMember: params.isMember,
  });

  const legalEntity = await repos.legalEntities.findById(venue.legalEntityId);
  if (!legalEntity) {
    throw new DomainError("NOT_FOUND", "Rechnungsaussteller nicht konfiguriert.");
  }
  const { netCents, taxCents } = splitGross(
    price.grossCents,
    legalEntity.defaultTaxRateBp,
  );

  return {
    startAt,
    endAt,
    grossCents: price.grossCents,
    netCents,
    taxCents,
    taxRateBp: legalEntity.defaultTaxRateBp,
    description:
      `Platzbuchung ${court.name}, ${formatWeekday(weekday)} ` +
      `${formatDate(startAt)}, ${params.time} Uhr (${params.durationMin} min)`,
    seasonId: season.id,
    legalEntityId: legalEntity.id,
    termsVersion: venue.termsVersion,
    holdMinutes: venue.holdMinutes,
    currency: "EUR",
    courtName: court.name,
  };
}

export async function createSingleBookingOrder(
  ctx: TenantContext,
  params: {
    userId: string;
    venueId: string;
    courtId: string;
    date: string;
    time: string;
    durationMin: number;
  },
): Promise<{ orderId: string; orderNumber: string }> {
  const quote = await getSingleBookingQuote(ctx, {
    ...params,
    isMember: false, // Mitgliederpreise folgen mit Ticket 4.6
  });

  const profile = await findProfile(params.userId);
  if (
    !profile?.billingStreet ||
    !profile.billingZip ||
    !profile.billingCity ||
    !profile.billingCountry
  ) {
    throw new DomainError(
      "BILLING_ADDRESS_REQUIRED",
      "Bitte zuerst die Rechnungsadresse im Konto hinterlegen.",
    );
  }

  try {
    const result = await createSingleBookingOrderTx(ctx, {
      userId: params.userId,
      venueId: params.venueId,
      legalEntityId: quote.legalEntityId,
      courtId: params.courtId,
      startAt: quote.startAt,
      endAt: quote.endAt,
      currency: quote.currency,
      termsVersion: quote.termsVersion,
      holdMinutes: quote.holdMinutes,
      description: quote.description,
      taxRateBp: quote.taxRateBp,
      netCents: quote.netCents,
      taxCents: quote.taxCents,
      grossCents: quote.grossCents,
      priceBreakdown: { grossCents: quote.grossCents },
      billingSnapshot: {
        name: profile.name,
        street: profile.billingStreet,
        zip: profile.billingZip,
        city: profile.billingCity,
        country: profile.billingCountry,
      },
    });
    invalidateOccupancyCache();
    return result;
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new DomainError(
        "SLOT_TAKEN",
        "Dieser Slot wurde gerade vergeben. Bitte eine andere Zeit wählen.",
      );
    }
    throw error;
  }
}
