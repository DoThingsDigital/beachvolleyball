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
