import { describe, expect, it } from "vitest";

import { availableFieldHours, windowMinutes } from "./report-availability";

// L1/L3: verfügbare Feldstunden = Öffnungszeit × aktive Plätze − Schließtage.
// Seed-Öffnungszeiten: Mo–Fr 08–22 (14 h), Sa–So 09–21 (12 h).

const OPENING: Record<string, [string, string][]> = {
  mon: [["08:00", "22:00"]],
  tue: [["08:00", "22:00"]],
  wed: [["08:00", "22:00"]],
  thu: [["08:00", "22:00"]],
  fri: [["08:00", "22:00"]],
  sat: [["09:00", "21:00"]],
  sun: [["09:00", "21:00"]],
};

describe("windowMinutes", () => {
  it("summiert Fenster, auch mehrere pro Tag", () => {
    expect(windowMinutes([["08:00", "22:00"]])).toBe(840);
    expect(
      windowMinutes([
        ["08:00", "12:00"],
        ["14:00", "20:00"],
      ]),
    ).toBe(600);
    expect(windowMinutes([])).toBe(0);
  });
});

describe("availableFieldHours", () => {
  it("volle Woche mit 4 Plätzen", () => {
    // Mo 02.11.–So 08.11.2026: 5×14 + 2×12 = 94 h je Platz
    const hours = availableFieldHours({
      dateFrom: "2026-11-02",
      dateTo: "2026-11-08",
      openingHours: OPENING,
      closedDates: [],
      activeCourtCount: 4,
    });
    expect(hours).toBe(94 * 4);
  });

  it("Schließtage reduzieren die Verfügbarkeit", () => {
    const hours = availableFieldHours({
      dateFrom: "2026-12-24",
      dateTo: "2026-12-26",
      openingHours: OPENING,
      closedDates: ["2026-12-24", "2026-12-25"],
      // Do 24.12. (14) + Fr 25.12. (14) entfallen; Sa 26.12. bleibt (12)
      activeCourtCount: 2,
    });
    expect(hours).toBe(12 * 2);
  });

  it("einzelner Tag, DST-Umstellungstag zählt kalendarisch", () => {
    // So 25.10.2026 (Zeitumstellung): Öffnungsfenster 09–21 = 12 h Wandzeit
    const hours = availableFieldHours({
      dateFrom: "2026-10-25",
      dateTo: "2026-10-25",
      openingHours: OPENING,
      closedDates: [],
      activeCourtCount: 1,
    });
    expect(hours).toBe(12);
  });

  it("ungültiger Zeitraum wirft", () => {
    expect(() =>
      availableFieldHours({
        dateFrom: "2026-11-08",
        dateTo: "2026-11-02",
        openingHours: OPENING,
        closedDates: [],
        activeCourtCount: 1,
      }),
    ).toThrowError();
  });
});
