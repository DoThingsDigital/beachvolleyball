import { TZDate } from "@date-fns/tz";

// Verfügbarkeitslogik Dauerplatz (Ticket 2.1, F1/D4) — reine Funktionen.
// Ein Dauerplatz ist ein wöchentlicher Slot (Court, Wochentag, Startzeit,
// Dauer) über die Saison. Konflikte auf Wochenebene entstehen durch andere
// Subscriptions und wöchentliche Blocks (Vereinskontingent, Liga).
// Einmalige Blocks (z. B. eine Wartung) sperren den Dauerplatz nicht,
// sondern werden bei der Materialisierung zu skippedDates (Ticket 5.1).

export type WeeklyOccupation = {
  courtId: string;
  /** 1 = Mo … 7 = So (ISO) */
  weekday: number;
  /** Minuten seit lokalem Mitternacht */
  startMin: number;
  endMin: number;
};

export type AvailableSlot = {
  courtId: string;
  weekday: number;
  /** "18:00" (lokale Zeit) */
  startTime: string;
  durationMin: number;
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minToTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function computeWeeklyAvailability(params: {
  slotMinutes: number;
  /** { mon: [["08:00","22:00"]], … } */
  openingHours: Record<string, [string, string][]>;
  durationsMin: readonly number[];
  courtIds: readonly string[];
  occupations: readonly WeeklyOccupation[];
}): AvailableSlot[] {
  const { slotMinutes, openingHours, durationsMin, courtIds, occupations } =
    params;

  // Belegungen je (court, weekday) vorgruppieren
  const byCourtDay = new Map<string, WeeklyOccupation[]>();
  for (const occ of occupations) {
    const key = `${occ.courtId}#${occ.weekday}`;
    const list = byCourtDay.get(key);
    if (list) list.push(occ);
    else byCourtDay.set(key, [occ]);
  }

  const result: AvailableSlot[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const windows = openingHours[WEEKDAY_KEYS[weekday - 1]!] ?? [];
    for (const [from, to] of windows) {
      const windowStart = timeToMin(from);
      const windowEnd = timeToMin(to);
      for (const courtId of courtIds) {
        const occs = byCourtDay.get(`${courtId}#${weekday}`) ?? [];
        for (const durationMin of durationsMin) {
          for (
            let start = windowStart;
            start + durationMin <= windowEnd;
            start += slotMinutes
          ) {
            const end = start + durationMin;
            const conflict = occs.some(
              (o) => o.startMin < end && start < o.endMin,
            );
            if (!conflict) {
              result.push({
                courtId,
                weekday,
                startTime: minToTime(start),
                durationMin,
              });
            }
          }
        }
      }
    }
  }
  return result;
}

// --- Belegungsquellen → WeeklyOccupation -----------------------------------

export function subscriptionToOccupation(sub: {
  courtId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
}): WeeklyOccupation {
  const startMin = timeToMin(sub.startTime);
  return {
    courtId: sub.courtId,
    weekday: sub.weekday,
    startMin,
    endMin: startMin + sub.durationMin,
  };
}

const BYDAY_TO_ISO: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

/** Unterstützt das im Projekt genutzte Muster FREQ=WEEKLY;BYDAY=…;
 *  alles andere (einmalig, monatlich, INTERVAL>1) → keine Wochenbelegung. */
export function parseWeeklyBydays(rrule: string | null): number[] | null {
  if (!rrule) return null;
  const parts = new Map(
    rrule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k?.toUpperCase() ?? "", v ?? ""] as const;
    }),
  );
  if (parts.get("FREQ") !== "WEEKLY") return null;
  const interval = parts.get("INTERVAL");
  if (interval && interval !== "1") return null;
  const byday = parts.get("BYDAY");
  if (!byday) return null;
  const days = byday
    .split(",")
    .map((d) => BYDAY_TO_ISO[d.trim().toUpperCase()])
    .filter((d): d is number => d !== undefined);
  return days.length > 0 ? days : null;
}

export function blockToOccupations(
  block: {
    courtId: string;
    startAt: Date;
    endAt: Date;
    rrule: string | null;
  },
  timezone: string,
): WeeklyOccupation[] {
  const weekdays = parseWeeklyBydays(block.rrule);
  if (!weekdays) return [];

  const startLocal = new TZDate(block.startAt.getTime(), timezone);
  const endLocal = new TZDate(block.endAt.getTime(), timezone);
  const startMin = startLocal.getHours() * 60 + startLocal.getMinutes();
  const endMin = endLocal.getHours() * 60 + endLocal.getMinutes();
  if (endMin <= startMin) return []; // Fenster über Mitternacht nicht unterstützt

  return weekdays.map((weekday) => ({
    courtId: block.courtId,
    weekday,
    startMin,
    endMin,
  }));
}
