import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import {
  addDays,
  blockToDayIntervals,
  bookingToDayInterval,
  computeDayOccupancy,
  isoWeekdayOfDate,
  localDateStart,
  type DayInterval,
  type DaySlot,
} from "@/src/domain/week-occupancy";

// Wochenbelegung für den öffentlichen Kalender (Ticket 4.1, D1).
// Cache je (Venue, Starttag) mit kurzer TTL – Korrektheit sichert ohnehin
// die erneute Prüfung beim Hold (DB-Constraint); der Kalender ist Anzeige.

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const CACHE_TTL_MS = 20_000;

export type DayOccupancy = {
  date: string;
  weekday: number;
  slots: DaySlot[];
};

export type WeekOccupancy = {
  venue: { id: string; name: string; slotMinutes: number };
  courts: { id: string; name: string }[];
  days: DayOccupancy[];
};

const cache = new Map<string, { at: number; data: WeekOccupancy }>();

export function invalidateOccupancyCache(): void {
  cache.clear();
}

export async function getWeekOccupancy(
  ctx: TenantContext,
  params: { venueId: string; startDate: string },
): Promise<WeekOccupancy> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
    throw new DomainError("INVALID_PERIOD", "Ungültiges Datum.");
  }
  const cacheKey = `${ctx.organisationId}#${params.venueId}#${params.startDate}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");

  const dates = Array.from({ length: 7 }, (_, i) => addDays(params.startDate, i));
  const rangeFrom = new Date(localDateStart(dates[0]!, venue.timezone));
  const rangeTo = new Date(
    localDateStart(addDays(params.startDate, 7), venue.timezone),
  );

  const [courts, blocks, bookings] = await Promise.all([
    repos.courts.findManyForVenue(venue.id),
    repos.blocks.findManyForVenue(venue.id),
    repos.bookings.findMany({
      venueId: venue.id,
      status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
      startAt: { lt: rangeTo },
      endAt: { gt: rangeFrom },
    }),
  ]);
  const courtIds = courts.map((c) => c.id);
  const openingHours = venue.openingHours as Record<string, [string, string][]>;

  const days: DayOccupancy[] = dates.map((date) => {
    const weekday = isoWeekdayOfDate(date);
    const intervals: DayInterval[] = [
      ...blocks.flatMap((b) => blockToDayIntervals(b, date, venue.timezone)),
      ...bookings
        .map((b) => bookingToDayInterval(b, date, venue.timezone))
        .filter((i): i is DayInterval => i !== null),
    ];
    return {
      date,
      weekday,
      slots: computeDayOccupancy({
        openingWindows: openingHours[WEEKDAY_KEYS[weekday - 1]!] ?? [],
        slotMinutes: venue.slotMinutes,
        courtIds,
        intervals,
      }),
    };
  });

  const data: WeekOccupancy = {
    venue: { id: venue.id, name: venue.name, slotMinutes: venue.slotMinutes },
    courts: courts.map((c) => ({ id: c.id, name: c.name })),
    days,
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
