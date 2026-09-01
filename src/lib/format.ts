// Einzige Stelle für die Formatierung von Beträgen und Zeiten (CLAUDE.md).

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

const DATE_BERLIN = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_BERLIN = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(date: Date): string {
  return DATE_BERLIN.format(date);
}

export function formatTime(date: Date): string {
  return TIME_BERLIN.format(date);
}

export function formatDateTime(date: Date): string {
  return `${DATE_BERLIN.format(date)}, ${TIME_BERLIN.format(date)} Uhr`;
}

const WEEKDAYS_DE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

/** 1 = Montag … 7 = Sonntag (ISO) */
export function formatWeekday(isoWeekday: number): string {
  return WEEKDAYS_DE[isoWeekday - 1] ?? `Tag ${isoWeekday}`;
}

/** "12,50" | "12.50" | "1.234,56" | "12" → Cent; ungültig → null */
export function parseEuroToCents(input: string): number | null {
  const trimmed = input.trim();
  // Mit Komma: Punkte sind Tausendertrenner; ohne Komma: Punkt = Dezimal
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
