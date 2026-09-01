import { TZDate } from "@date-fns/tz";

// Wochen-/Tagesbelegung für den öffentlichen Kalender (Ticket 4.1, D1).
// Zustände je Slot und Platz:
//   FREI      – buchbar
//   BELEGT    – aktive Belegung (Kunde/Dauerplatz: HOLD/PENDING/CONFIRMED)
//   VEREIN    – Vereinskontingent/Liga (materialisierte Block-Belegung, 5.1)
//   GESPERRT  – Wartung/Event/Sperre (materialisierte Block-Belegung)
// Seit Ticket 5.1 sind Sperren als Bookings materialisiert; die Anzeige
// liest nur noch Belegungen. RELEASED-Belegungen sind nicht aktiv und
// erscheinen damit als FREI (kommerziell nachbuchbar, E3).

export type SlotState = "FREI" | "BELEGT" | "VEREIN" | "GESPERRT";

export type DayInterval = {
  courtId: string;
  startMin: number;
  endMin: number;
  state: Exclude<SlotState, "FREI">;
};

/** Mitglieder-Buchungsfenster (E-005) als Tagesintervall */
export type MemberWindowInterval = {
  courtId: string;
  startMin: number;
  endMin: number;
  /** Freigabefrist in Stunden vor Slot-Beginn */
  releaseHours: number;
};

export type DaySlot = {
  /** "18:30" (lokale Zeit) */
  time: string;
  startMin: number;
  states: Record<string, SlotState>;
  /** courtId → Freigabefrist, wenn der Slot in einem Mitglieder-Fenster liegt */
  memberWindows: Record<string, number>;
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
  memberWindows?: readonly MemberWindowInterval[];
}): DaySlot[] {
  const {
    openingWindows,
    slotMinutes,
    courtIds,
    intervals,
    memberWindows = [],
  } = params;

  const byCourt = new Map<string, DayInterval[]>();
  for (const interval of intervals) {
    const list = byCourt.get(interval.courtId);
    if (list) list.push(interval);
    else byCourt.set(interval.courtId, [interval]);
  }
  const windowsByCourt = new Map<string, MemberWindowInterval[]>();
  for (const window of memberWindows) {
    const list = windowsByCourt.get(window.courtId);
    if (list) list.push(window);
    else windowsByCourt.set(window.courtId, [window]);
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
      const slotMemberWindows: Record<string, number> = {};
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
        for (const window of windowsByCourt.get(courtId) ?? []) {
          if (window.startMin < end && start < window.endMin) {
            slotMemberWindows[courtId] = window.releaseHours;
            break;
          }
        }
      }
      slots.push({
        time: minToTime(start),
        startMin: start,
        states,
        memberWindows: slotMemberWindows,
      });
    }
  }
  return slots;
}

// --- Intervall-Quellen ------------------------------------------------------

/** Anzeigezustand einer Belegung: materialisierte Sperren nach usageType,
 *  alles andere ist eine gewöhnliche Buchung. */
export function bookingStateFor(
  kind: string,
  usageType: string,
): Exclude<SlotState, "FREI"> {
  if (kind !== "BLOCK") return "BELEGT";
  return usageType === "VEREIN" || usageType === "LIGA" ? "VEREIN" : "GESPERRT";
}

/** Instant-Paar auf lokale Tagesminuten eines Kalendertags projizieren
 *  (null, wenn keine Überlappung mit dem Tag). */
export function instantsToDayMinutes(
  startAt: Date,
  endAt: Date,
  date: string,
  timezone: string,
): { startMin: number; endMin: number } | null {
  const dayStart = localDateStart(date, timezone);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const startMs = Math.max(startAt.getTime(), dayStart);
  const endMs = Math.min(endAt.getTime(), dayEnd);
  if (endMs <= startMs) return null;
  return {
    startMin: msToLocalMin(startMs, timezone),
    endMin: endMs === dayEnd ? 24 * 60 : msToLocalMin(endMs, timezone),
  };
}

export function bookingToDayInterval(
  booking: {
    courtId: string;
    startAt: Date;
    endAt: Date;
    kind: string;
    usageType: string;
  },
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
    state: bookingStateFor(booking.kind, booking.usageType),
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
