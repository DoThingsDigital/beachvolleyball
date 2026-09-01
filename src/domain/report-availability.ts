import { isoWeekdayOfDate, addDays } from "./week-occupancy";
import { DomainError } from "./errors";

// Verfügbare Feldstunden (L1/L3, Nenner "Öffnungs-Feldstunden"):
// Öffnungszeit × aktive Plätze über den Zeitraum, minus Schließtage.
// Basis sind die HEUTE konfigurierten Öffnungszeiten/Plätze – historische
// Konfigurationsänderungen werden nicht nachgehalten (im Report vermerkt).

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function windowMinutes(windows: [string, string][]): number {
  let sum = 0;
  for (const [from, to] of windows) {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    sum += Math.max(0, (th ?? 0) * 60 + (tm ?? 0) - ((fh ?? 0) * 60 + (fm ?? 0)));
  }
  return sum;
}

/** Feldstunden je Kalendertag (ohne Courts-Faktor). */
export function openingHoursPerDay(
  openingHours: Record<string, [string, string][]>,
): Record<number, number> {
  const result: Record<number, number> = {};
  for (let weekday = 1; weekday <= 7; weekday++) {
    result[weekday] =
      windowMinutes(openingHours[WEEKDAY_KEYS[weekday - 1]!] ?? []) / 60;
  }
  return result;
}

/** Verfügbare Feldstunden im Zeitraum [dateFrom, dateTo] (beide inklusive,
 *  lokale Kalendertage). */
export function availableFieldHours(params: {
  dateFrom: string;
  dateTo: string;
  openingHours: Record<string, [string, string][]>;
  closedDates: readonly string[];
  activeCourtCount: number;
}): number {
  const { dateFrom, dateTo, openingHours, closedDates, activeCourtCount } =
    params;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ||
    dateTo < dateFrom
  ) {
    throw new DomainError("INVALID_PERIOD", "Ungültiger Report-Zeitraum.");
  }
  const perDay = openingHoursPerDay(openingHours);
  const closed = new Set(closedDates);

  let hours = 0;
  for (let d = dateFrom; d <= dateTo; d = addDays(d, 1)) {
    if (closed.has(d)) continue;
    hours += perDay[isoWeekdayOfDate(d)] ?? 0;
  }
  return hours * activeCourtCount;
}
