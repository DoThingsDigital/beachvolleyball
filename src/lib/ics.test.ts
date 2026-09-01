import { describe, expect, it } from "vitest";

import { buildIcs } from "./ics";

describe("buildIcs", () => {
  it("erzeugt gültiges VCALENDAR mit UTC-Zeiten und Escaping", () => {
    const ics = buildIcs({
      uid: "booking-123@dtd-booking",
      title: "Beachvolleyball, Feld 1",
      description: "Zeile 1\nZeile 2; mit Komma,",
      location: "Picco Beach, Köln",
      startAt: new Date("2026-11-02T18:00:00Z"),
      endAt: new Date("2026-11-02T19:00:00Z"),
      stamp: new Date("2026-09-01T12:00:00Z"),
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261102T180000Z");
    expect(ics).toContain("DTEND:20261102T190000Z");
    expect(ics).toContain("SUMMARY:Beachvolleyball\\, Feld 1");
    expect(ics).toContain("DESCRIPTION:Zeile 1\\nZeile 2\\; mit Komma\\,");
    expect(ics).toContain("LOCATION:Picco Beach\\, Köln");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
