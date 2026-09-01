import { TZDate } from "@date-fns/tz";

import { parseWeeklyBydays } from "./subscription-availability";

// Wochen-/Tagesbelegung für den öffentlichen Kalender (Ticket 4.1, D1).
// Zustände je 30-min-Slot und Platz:
//   FREI      – buchbar
//   BELEGT    – aktive Belegung (Kunde/Dauerplatz: HOLD/PENDING/CONFIRMED)
//   VEREIN    – Vereinskontingent/Liga (aus Block-Regeln)
//   GESPERRT  – Wartung/Event/Sperre
// Buchungen schlagen Blockzustände (z. B. weiterverkaufter RELEASED-Slot).

export type SlotState = "FREI" | "BELEGT" | "VEREIN" | "GESPERRT";

export type DayInterval = {
  courtId: string;
  startMin: number;
  endMin: number;
  state: Exclude<SlotState, "FREI">;
};

export type DaySlot = {
  /** "18:30" (lokale Zeit) */
  time: string;
  startMin: number;
  states: Record<string, SlotState>;
};

function minToTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function computeDayOccupancy(params: {
  openingWindows: [string, string][];
  slotMinutes: number;
  courtIds: readonly string[];
  intervals: readonly DayInterval[];
}): DaySlot[] {
  const { openingWindows, slotMinutes, courtIds, intervals } = params;

  const byCourt = new Map<string, DayInterval[]>();
  for (const interval of intervals) {
    const list = byCourt.get(interval.courtId);
    if (list) list.push(interval);
    else byCourt.set(interval.courtId, [interval]);
  }

  const slots: DaySlot[] = [];
  for (const [from, to] of openingWindows) {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    const windowStart = (fh ?? 0) * 60 + (fm ?? 0);
    const windowEnd = (th ?? 0) * 60 + (tm ?? 0);

    for (let start = windowStart; start + slotMinutes <= windowEnd; start += slotMinutes) {
      const end = start + slotMinutes;
      const states: Record<string, SlotState> = {};
      for (const courtId of courtIds) {
        let state: SlotState = "FREI";
        for (const interval of byCourt.get(courtId) ?? []) {
          if (interval.startMin < end && start < interval.endMin) {
            // Buchung dominiert; sonst erster Blocktreffer
            if (interval.state === "BELEGT") {
              state = "BELEGT";
              break;
            }
            if (state === "FREI") state = interval.state;
          }
        }
        states[courtId] = state;
      }
      slots.push({ time: minToTime(start), startMin: start, states });
    }
  }
  return slots;
}

// --- Intervall-Quellen ------------------------------------------------------

export function bookingToDayInterval(
  booking: { courtId: string; startAt: Date; endAt: Date },
  date: string,
  timezone: string,
): DayInterval | null {
  const dayStart = localDateStart(date, timezone);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const startMs = Math.max(booking.startAt.getTime(), dayStart);
  const endMs = Math.min(booking.endAt.getTime(), dayEnd);
  if (endMs <= startMs) return null;
  return {
    courtId: booking.courtId,
    startMin: msToLocalMin(startMs, timezone),
    endMin: endMs === dayEnd ? 24 * 60 : msToLocalMin(endMs, timezone),
    state: "BELEGT",
  };
}

export function localDateStart(date: string, timezone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new TZDate(y!, m! - 1, d!, 0, 0, timezone).getTime();
}

/** ISO-Wochentag (1 = Mo … 7 = So) eines lokalen Kalenderdatums */
export function isoWeekdayOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** date + n Tage als "YYYY-MM-DD" (kalendarisch, DST-sicher über UTC-Mittag) */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  return next.toISOString().slice(0, 10);
}

function msToLocalMin(ms: number, timezone: string): number {
  const local = new TZDate(ms, timezone);
  return local.getHours() * 60 + local.getMinutes();
}

function blockStateFor(type: string): Exclude<SlotState, "FREI" | "BELEGT"> {
  return type === "VEREIN" || type === "LIGA" ? "VEREIN" : "GESPERRT";
}

function parseUntil(rrule: string): number | null {
  const match = /UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rrule);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
}

/** Expandiert Block-Regeln (wöchentlich per RRULE oder einmalig) auf einen
 *  lokalen Kalendertag. */
export function blockToDayIntervals(
  block: {
    courtId: string;
    type: string;
    startAt: Date;
    endAt: Date;
    rrule: string | null;
  },
  date: string,
  timezone: string,
): DayInterval[] {
  const state = blockStateFor(block.type);
  const startLocal = new TZDate(block.startAt.getTime(), timezone);
  const endLocal = new TZDate(block.endAt.getTime(), timezone);
  const startMin = startLocal.getHours() * 60 + startLocal.getMinutes();
  const endMin = endLocal.getHours() * 60 + endLocal.getMinutes();

  const weekdays = parseWeeklyBydays(block.rrule);
  if (!weekdays) {
    // Einmalige Sperre: gilt nur am lokalen Datum des Beginns
    const blockDate = `${startLocal.getFullYear()}-${String(startLocal.getMonth() + 1).padStart(2, "0")}-${String(startLocal.getDate()).padStart(2, "0")}`;
    if (blockDate !== date || endMin <= startMin) return [];
    return [{ courtId: block.courtId, startMin, endMin, state }];
  }

  const [y, m, d] = date.split("-").map(Number);
  const utcNoon = Date.UTC(y!, m! - 1, d!, 12);
  const day = new Date(utcNoon).getUTCDay();
  const isoWeekday = day === 0 ? 7 : day;
  if (!weekdays.includes(isoWeekday)) return [];

  // Serienfenster: erst ab dem Tag der ersten Ausprägung, bis UNTIL
  const endOfRequestedDayUtc = utcNoon + 12 * 3_600_000;
  if (block.startAt.getTime() > endOfRequestedDayUtc) return [];
  const until = block.rrule ? parseUntil(block.rrule) : null;
  if (until !== null && utcNoon > until) return [];
  if (endMin <= startMin) return [];

  return [{ courtId: block.courtId, startMin, endMin, state }];
}
