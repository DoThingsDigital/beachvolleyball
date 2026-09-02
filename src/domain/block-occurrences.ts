import { TZDate } from "@date-fns/tz";

import { DomainError } from "./errors";
import { parseWeeklyBydays } from "./subscription-availability";

// Sperren-Materialisierung (Ticket 5.1, E1/E2) — reine Funktionen.
// Ein Block ist eine Regel (erster Termin + optionale wöchentliche
// Wiederholung). Materialisiert wird in konkrete Termine (Instants),
// begrenzt auf ein Fenster (Saisonhorizont). Wandzeit bleibt über die
// Zeitumstellung konstant (25.10.2026: 18:00 lokal bleibt 18:00 lokal).

export type BlockRule = {
  /** Beginn des ersten Termins (Instant); definiert die lokale Wandzeit */
  startAt: Date;
  /** Ende des ersten Termins (gleicher lokaler Tag, Ende > Beginn) */
  endAt: Date;
  /** RFC-5545-Teilmenge: FREQ=WEEKLY;BYDAY=…[;UNTIL=…Z]; null = einmalig */
  rrule?: string | null;
};

export type BlockOccurrence = {
  startAt: Date;
  endAt: Date;
};

/** UNTIL aus einer RRULE lesen (UTC-Instant, inklusiv). */
export function parseUntil(rrule: string | null | undefined): Date | null {
  if (!rrule) return null;
  const match = /(?:^|;)UNTIL=([0-9TZ]+)/i.exec(rrule);
  if (!match) return null;
  const raw = match[1]!;
  const m =
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h ?? "23"),
      Number(mi ?? "59"),
      Number(s ?? "59"),
    ),
  );
}

function wallMinutes(instant: Date, timezone: string): number {
  const local = new TZDate(instant.getTime(), timezone);
  return local.getHours() * 60 + local.getMinutes();
}

/** Alle konkreten Termine eines Blocks im Fenster [windowFrom, windowTo).
 *  Einmalige Blocks liefern höchstens einen Termin (wenn er das Fenster
 *  schneidet); wöchentliche liefern je BYDAY-Wochentag einen Termin pro
 *  Woche zur lokalen Wandzeit des ersten Termins. */
export function listBlockOccurrences(params: {
  block: BlockRule;
  timezone: string;
  windowFrom: Date;
  windowTo: Date;
}): BlockOccurrence[] {
  const { block, timezone, windowFrom, windowTo } = params;
  if (block.endAt.getTime() <= block.startAt.getTime()) {
    throw new DomainError("INVALID_PERIOD", "Sperrende muss nach Beginn liegen.");
  }

  const weekdays = parseWeeklyBydays(block.rrule ?? null);
  if (!weekdays) {
    // Ganztages-Zeitraum (Start und Ende auf lokal 00:00, so nur von
    // Zeitraum-Sperren erzeugt): je lokalem Tag ein Termin 00:00–24:00.
    // So blockiert eine bestehende Buchung nur ihren Tag statt der ganzen
    // Spanne, und der Kalender zeigt tageweise Belegungen.
    if (
      wallMinutes(block.startAt, timezone) === 0 &&
      wallMinutes(block.endAt, timezone) === 0
    ) {
      const out: BlockOccurrence[] = [];
      let cursor = new TZDate(block.startAt.getTime(), timezone);
      while (cursor.getTime() < block.endAt.getTime()) {
        const next = new Date(
          new TZDate(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate() + 1,
            0,
            0,
            timezone,
          ).getTime(),
        );
        const dayStart = new Date(cursor.getTime());
        if (
          dayStart.getTime() < windowTo.getTime() &&
          next.getTime() > windowFrom.getTime()
        ) {
          out.push({ startAt: dayStart, endAt: next });
        }
        cursor = new TZDate(next.getTime(), timezone);
      }
      return out;
    }
    // Einmalige Sperre: materialisieren, wenn sie das Fenster schneidet.
    return block.startAt.getTime() < windowTo.getTime() &&
      block.endAt.getTime() > windowFrom.getTime()
      ? [{ startAt: block.startAt, endAt: block.endAt }]
      : [];
  }

  const startMin = wallMinutes(block.startAt, timezone);
  const endMin = wallMinutes(block.endAt, timezone);
  if (endMin <= startMin) {
    throw new DomainError(
      "INVALID_PERIOD",
      "Wiederkehrende Sperren über Mitternacht werden nicht unterstützt.",
    );
  }

  const until = parseUntil(block.rrule);
  const lowerBound = Math.max(block.startAt.getTime(), windowFrom.getTime());
  const wanted = new Set(weekdays);

  // Kalendertage über UTC-Mittag iterieren (DST-sicher), ±1 Tag Puffer,
  // weil lokaler Tag und UTC-Tag an den Rändern auseinanderfallen können.
  const first = new Date(lowerBound - 86_400_000);
  const last = new Date(
    Math.min(windowTo.getTime(), until?.getTime() ?? Infinity) + 86_400_000,
  );

  const occurrences: BlockOccurrence[] = [];
  for (
    let day = Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      first.getUTCDate(),
      12,
    );
    day <= last.getTime();
    day += 86_400_000
  ) {
    const d = new Date(day);
    const utcDay = d.getUTCDay();
    if (!wanted.has(utcDay === 0 ? 7 : utcDay)) continue;

    const startLocal = new TZDate(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      Math.floor(startMin / 60),
      startMin % 60,
      timezone,
    );
    const startAt = new Date(startLocal.getTime());
    if (startAt.getTime() < lowerBound) continue;
    if (startAt.getTime() >= windowTo.getTime()) continue;
    if (until && startAt.getTime() > until.getTime()) continue;

    const endLocal = new TZDate(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      Math.floor(endMin / 60),
      endMin % 60,
      timezone,
    );
    occurrences.push({ startAt, endAt: new Date(endLocal.getTime()) });
  }
  return occurrences;
}

export type MemberWindowBlock = {
  courtId: string;
  startAt: Date;
  endAt: Date;
  rrule?: string | null;
  clubId: string | null;
  releaseHoursBefore: number | null;
};

/** Mitglieder-Buchungsfenster (E-005): liefert das Fenster, das den Slot
 *  überlappt (Teilüberlappung genügt – der Slot gilt dann als Vereins-Slot),
 *  oder null. Blocks müssen bereits auf memberSelfBooking gefiltert sein. */
export function findMemberWindowForSlot(params: {
  blocks: readonly MemberWindowBlock[];
  timezone: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
}): { clubId: string | null; releaseHoursBefore: number | null } | null {
  const { blocks, timezone, courtId, startAt, endAt } = params;
  const windowFrom = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
  const windowTo = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);

  for (const block of blocks) {
    if (block.courtId !== courtId) continue;
    const occurrences = listBlockOccurrences({
      block,
      timezone,
      windowFrom,
      windowTo,
    });
    const hit = occurrences.some(
      (o) => o.startAt.getTime() < endAt.getTime() && startAt.getTime() < o.endAt.getTime(),
    );
    if (hit) {
      return {
        clubId: block.clubId,
        releaseHoursBefore: block.releaseHoursBefore,
      };
    }
  }
  return null;
}

/** usageType einer materialisierten Sperre (Invariante 10). */
export function usageTypeForBlockType(
  type: "VEREIN" | "LIGA" | "WARTUNG" | "EVENT" | "GESPERRT",
): "VEREIN" | "LIGA" | "INTERN" {
  if (type === "VEREIN") return "VEREIN";
  if (type === "LIGA") return "LIGA";
  return "INTERN";
}
