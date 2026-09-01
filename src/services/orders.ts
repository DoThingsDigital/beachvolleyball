import {
  createSubscriptionOrderTx,
  expireHoldsTx,
  isExclusionViolation,
} from "@/src/db/orders";
import { createRepositories } from "@/src/db/repositories";
import { findProfile } from "@/src/db/users";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { splitGross } from "@/src/domain/pricing";
import { getSubscriptionQuote } from "./subscription-quote";

// Use-Case (Ticket 2.3): Dauerplatz bestellen. Preise entstehen serverseitig
// über den Quote-Service; die DB-Transaktion materialisiert alle Termine als
// HOLD – das Exclusion-Constraint entscheidet über Doppelverkäufe.

const WEEKDAY_NAMES = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export async function createSubscriptionOrder(
  ctx: TenantContext,
  params: {
    userId: string;
    venueId: string;
    seasonId: string;
    courtId: string;
    weekday: number;
    startTime: string;
    durationMin: number;
  },
): Promise<{ orderId: string; orderNumber: string }> {
  const repos = createRepositories(ctx);

  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");

  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const season = seasons.find((s) => s.id === params.seasonId);
  if (!season) throw new DomainError("NOT_FOUND", "Saison nicht gefunden.");
  // B3: Dauerplatz-Verkauf nur in PRESALE oder ACTIVE
  if (season.status !== "PRESALE" && season.status !== "ACTIVE") {
    throw new DomainError(
      "SEASON_NOT_BOOKABLE",
      "Für diese Saison ist der Verkauf nicht geöffnet.",
    );
  }

  const courts = await repos.courts.findManyForVenue(venue.id);
  const court = courts.find((c) => c.id === params.courtId);
  if (!court) throw new DomainError("NOT_FOUND", "Platz nicht gefunden.");

  // A2: Rechnungsadresse ist Pflicht vor dem ersten Kauf
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

  const legalEntity = await repos.legalEntities.findById(venue.legalEntityId);
  if (!legalEntity) {
    throw new DomainError("NOT_FOUND", "Rechnungsaussteller nicht konfiguriert.");
  }

  const quote = await getSubscriptionQuote(ctx, {
    venueId: venue.id,
    seasonId: season.id,
    courtId: court.id,
    weekday: params.weekday,
    startTime: params.startTime,
    durationMin: params.durationMin,
    isMember: false, // Mitgliederpreise folgen mit Ticket 4.6
  });

  const { netCents, taxCents } = splitGross(
    quote.totalCents,
    legalEntity.defaultTaxRateBp,
  );

  const description =
    `Dauerplatz ${court.name}, ${WEEKDAY_NAMES[params.weekday - 1]} ` +
    `${params.startTime} Uhr (${params.durationMin} min), ${season.name}, ` +
    `${quote.occurrenceCount} Termine`;

  try {
    const result = await createSubscriptionOrderTx(ctx, {
      userId: params.userId,
      venueId: venue.id,
      legalEntityId: legalEntity.id,
      seasonId: season.id,
      courtId: court.id,
      weekday: params.weekday,
      startTime: params.startTime,
      durationMin: params.durationMin,
      currency: "EUR",
      termsVersion: venue.termsVersion,
      holdMinutes: venue.holdMinutes,
      description,
      servicePeriodFrom: season.startDate,
      servicePeriodTo: season.endDate,
      taxRateBp: legalEntity.defaultTaxRateBp,
      netCents,
      taxCents,
      grossCents: quote.totalCents,
      perOccurrenceCents: quote.perOccurrenceCents,
      lastOccurrenceCents: quote.lastOccurrenceCents,
      priceBreakdown: {
        occurrenceCount: quote.occurrenceCount,
        grossPerOccurrenceCents: quote.grossPerOccurrenceCents,
        discountBp: quote.discountBp,
        discountCents: quote.discountCents,
        perOccurrenceCents: quote.perOccurrenceCents,
        lastOccurrenceCents: quote.lastOccurrenceCents,
      },
      billingSnapshot: {
        name: profile.name,
        street: profile.billingStreet,
        zip: profile.billingZip,
        city: profile.billingCity,
        country: profile.billingCountry,
      },
      occurrences: quote.occurrences,
    });
    return result;
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new DomainError(
        "SLOT_TAKEN",
        "Dieser Dauerplatz wurde gerade vergeben. Bitte eine andere Zeit wählen.",
      );
    }
    throw error;
  }
}

export async function expireHolds(now: Date = new Date()) {
  return expireHoldsTx(now);
}
