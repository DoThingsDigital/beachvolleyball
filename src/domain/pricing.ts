import { TZDate } from "@date-fns/tz";

import { DomainError } from "./errors";

// Preisberechnung (Ticket 1.7) — reine Funktionen, keine I/O.
// Regeln speichern BRUTTO-Preise (Endkundenpreise); Netto/Steuer werden bei
// Bestellung rückgerechnet (CLAUDE.md Invariante 1, 02_DATENMODELL.md).
// Alle Zeitfenster/Wochentage rechnen in lokaler Zeit (Venue.timezone).

export type PriceRuleInput = {
  id: string;
  /** leer = gilt für alle Plätze */
  courtIds: readonly string[];
  /** 1 = Mo … 7 = So (ISO) */
  weekdays: readonly number[];
  /** "17:00" ≤ Slotbeginn < "22:00" — Fenster über Mitternacht sind unzulässig */
  timeFrom: string;
  timeTo: string;
  pricePerHourCents: number;
  memberPricePerHourCents?: number | null;
  priority: number;
  active: boolean;
};

export type SlotBreakdown = {
  slotStart: Date;
  slotEnd: Date;
  ruleId: string;
  rateCents: number;
  slotCents: number;
};

export type PriceResult = {
  grossCents: number;
  breakdown: SlotBreakdown[];
};

function isoWeekday(d: TZDate): number {
  const day = d.getDay(); // 0 = So … 6 = Sa (lokal, dank TZDate)
  return day === 0 ? 7 : day;
}

function localTimeHHMM(d: TZDate): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function computePrice(params: {
  slotMinutes: number;
  timezone: string;
  rules: readonly PriceRuleInput[];
  courtId: string;
  startAt: Date;
  endAt: Date;
  isMember: boolean;
}): PriceResult {
  const { slotMinutes, timezone, rules, courtId, startAt, endAt, isMember } =
    params;

  const durationMs = endAt.getTime() - startAt.getTime();
  if (durationMs <= 0) {
    throw new DomainError("INVALID_PERIOD", "Ende muss nach Beginn liegen.");
  }
  const slotMs = slotMinutes * 60_000;
  if (durationMs % slotMs !== 0) {
    throw new DomainError(
      "INVALID_PERIOD",
      `Zeitraum muss ein Vielfaches von ${slotMinutes} Minuten sein.`,
    );
  }

  const breakdown: SlotBreakdown[] = [];
  for (let t = startAt.getTime(); t < endAt.getTime(); t += slotMs) {
    const slotStart = new Date(t);
    const local = new TZDate(t, timezone);
    const weekday = isoWeekday(local);
    const time = localTimeHHMM(local);

    const candidates = rules.filter(
      (r) =>
        r.active &&
        (r.courtIds.length === 0 || r.courtIds.includes(courtId)) &&
        r.weekdays.includes(weekday) &&
        r.timeFrom <= time &&
        time < r.timeTo,
    );
    if (candidates.length === 0) {
      throw new DomainError(
        "NO_PRICE_RULE",
        `Kein Preis für Slot ${local.toISOString()} (${time}, Wochentag ${weekday}).`,
      );
    }
    // Höchste Priorität gewinnt; bei Gleichstand entscheidet die stabile
    // Eingabereihenfolge — Prioritäten sollten eindeutig konfiguriert sein.
    const rule = candidates.reduce((best, r) =>
      r.priority > best.priority ? r : best,
    );

    const rate =
      isMember && rule.memberPricePerHourCents != null
        ? rule.memberPricePerHourCents
        : rule.pricePerHourCents;
    const slotCents = Math.round((rate * slotMinutes) / 60);

    breakdown.push({
      slotStart,
      slotEnd: new Date(t + slotMs),
      ruleId: rule.id,
      rateCents: rate,
      slotCents,
    });
  }

  return {
    grossCents: breakdown.reduce((sum, s) => sum + s.slotCents, 0),
    breakdown,
  };
}

// Steuer aus Brutto rückrechnen: net = round(gross / (1 + Satz)), Steuer = Differenz.
export function splitGross(
  grossCents: number,
  taxRateBp: number,
): { netCents: number; taxCents: number } {
  const netCents = Math.round((grossCents * 10_000) / (10_000 + taxRateBp));
  return { netCents, taxCents: grossCents - netCents };
}

// ---------------------------------------------------------------------------
// Dauerplatz (Subscription)
// ---------------------------------------------------------------------------

export type Occurrence = {
  /** Kalendertag in lokaler Zeit, "YYYY-MM-DD" */
  date: string;
  startAt: Date;
  endAt: Date;
};

// Alle Termine eines Dauerplatzes: wöchentlich am `weekday` um `startTime`
// (lokale Zeit) zwischen dateFrom und dateTo (inklusive), ohne closed/skipped.
// Über die Zeitumstellung hinweg bleibt die lokale Startzeit konstant
// (25.10.2026: der UTC-Offset wechselt von +02:00 auf +01:00).
export function listOccurrences(params: {
  timezone: string;
  /** 1 = Mo … 7 = So (ISO) */
  weekday: number;
  /** "19:00" (lokale Zeit) */
  startTime: string;
  durationMin: number;
  /** "YYYY-MM-DD" (lokales Datum, inklusive) */
  dateFrom: string;
  dateTo: string;
  excludedDates?: readonly string[];
}): Occurrence[] {
  const {
    timezone,
    weekday,
    startTime,
    durationMin,
    dateFrom,
    dateTo,
    excludedDates = [],
  } = params;

  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!match || weekday < 1 || weekday > 7 || durationMin <= 0) {
    throw new DomainError("INVALID_PERIOD", "Ungültige Dauerplatz-Parameter.");
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const excluded = new Set(excludedDates);

  const from = new Date(`${dateFrom}T12:00:00Z`);
  const to = new Date(`${dateTo}T12:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new DomainError("INVALID_PERIOD", "Ungültiger Dauerplatz-Zeitraum.");
  }

  const occurrences: Occurrence[] = [];
  // Iteration über UTC-Mittag vermeidet DST-Artefakte bei der Tageszählung.
  for (let d = from; d <= to; d = new Date(d.getTime() + 86_400_000)) {
    const utcDay = d.getUTCDay();
    if ((utcDay === 0 ? 7 : utcDay) !== weekday) continue;

    const date = d.toISOString().slice(0, 10);
    if (excluded.has(date)) continue;

    const startLocal = new TZDate(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      hours,
      minutes,
      timezone,
    );
    const startAt = new Date(startLocal.getTime());
    occurrences.push({
      date,
      startAt,
      endAt: new Date(startAt.getTime() + durationMin * 60_000),
    });
  }
  return occurrences;
}

export type SubscriptionPrice = {
  /** Summe nach Rabatt (Brutto) */
  totalCents: number;
  /** Preis je Termin (alle außer dem letzten) */
  perOccurrenceCents: number;
  /** letzter Termin trägt den Rundungsrest */
  lastOccurrenceCents: number;
  discountCents: number;
};

// totalNet = round(sum × (1 − discountBp/10000)); Rest auf letzten Termin
// (02_DATENMODELL.md, Abschnitt Preisberechnung).
export function computeSubscriptionPrice(params: {
  occurrenceGrossCents: readonly number[];
  discountBp: number;
}): SubscriptionPrice {
  const { occurrenceGrossCents, discountBp } = params;
  if (occurrenceGrossCents.length === 0) {
    throw new DomainError("INVALID_PERIOD", "Dauerplatz ohne Termine.");
  }

  const sum = occurrenceGrossCents.reduce((a, b) => a + b, 0);
  const totalCents = Math.round((sum * (10_000 - discountBp)) / 10_000);
  const n = occurrenceGrossCents.length;
  const perOccurrenceCents = Math.floor(totalCents / n);
  const lastOccurrenceCents =
    totalCents - perOccurrenceCents * (n - 1);

  return {
    totalCents,
    perOccurrenceCents,
    lastOccurrenceCents,
    discountCents: sum - totalCents,
  };
}
