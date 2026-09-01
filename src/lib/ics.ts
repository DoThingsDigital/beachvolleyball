// Minimaler ICS-Builder (RFC 5545) für Buchungsbestätigungen (D5).
// Zeiten in UTC; Clients rechnen in die lokale Zone um.

function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildIcs(event: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  stamp?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dtd-booking//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsDate(event.stamp ?? new Date())}`,
    `DTSTART:${icsDate(event.startAt)}`,
    `DTEND:${icsDate(event.endAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
