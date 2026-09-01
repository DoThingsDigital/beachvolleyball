import { describe, expect, it } from "vitest";

import {
  bookingStateFor,
  bookingToDayInterval,
  computeDayOccupancy,
  type DayInterval,
} from "./week-occupancy";

const TZ = "Europe/Berlin";

describe("computeDayOccupancy", () => {
  const base = {
    openingWindows: [["18:00", "21:00"]] as [string, string][],
    slotMinutes: 30,
    courtIds: ["c1", "c2"],
  };

  it("ohne Belegungen ist alles frei", () => {
    const slots = computeDayOccupancy({ ...base, intervals: [] });
    expect(slots).toHaveLength(6); // 18:00 … 20:30
    expect(slots.every((s) => s.states.c1 === "FREI" && s.states.c2 === "FREI")).toBe(true);
  });

  it("Buchung markiert nur ihre Slots und ihren Platz", () => {
    const intervals: DayInterval[] = [
      { courtId: "c1", startMin: 19 * 60, endMin: 20 * 60, state: "BELEGT" },
    ];
    const slots = computeDayOccupancy({ ...base, intervals });
    const at = (t: string) => slots.find((s) => s.time === t)!;
    expect(at("18:30").states.c1).toBe("FREI");
    expect(at("19:00").states.c1).toBe("BELEGT");
    expect(at("19:30").states.c1).toBe("BELEGT");
    expect(at("20:00").states.c1).toBe("FREI");
    expect(at("19:00").states.c2).toBe("FREI");
  });

  it("Buchung dominiert Blockzustand (Weiterverkauf eines freigegebenen Slots)", () => {
    const intervals: DayInterval[] = [
      { courtId: "c1", startMin: 18 * 60, endMin: 21 * 60, state: "VEREIN" },
      { courtId: "c1", startMin: 19 * 60, endMin: 20 * 60, state: "BELEGT" },
    ];
    const slots = computeDayOccupancy({ ...base, intervals });
    const at = (t: string) => slots.find((s) => s.time === t)!;
    expect(at("18:00").states.c1).toBe("VEREIN");
    expect(at("19:00").states.c1).toBe("BELEGT");
    expect(at("20:30").states.c1).toBe("VEREIN");
  });

  it("Performance: 4 Plätze, voller Tag, 500 Intervalle < 100 ms", () => {
    const intervals: DayInterval[] = Array.from({ length: 500 }, (_, i) => ({
      courtId: `c${(i % 4) + 1}`,
      startMin: 480 + (i % 26) * 30,
      endMin: 480 + (i % 26) * 30 + 60,
      state: "BELEGT" as const,
    }));
    const start = performance.now();
    computeDayOccupancy({
      openingWindows: [["08:00", "22:00"]],
      slotMinutes: 30,
      courtIds: ["c1", "c2", "c3", "c4"],
      intervals,
    });
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("bookingToDayInterval", () => {
  it("wandelt UTC-Buchung in lokale Minuten", () => {
    // 19:00–20:00 lokal am 02.11.2026 (CET, +01)
    const interval = bookingToDayInterval(
      {
        courtId: "c1",
        startAt: new Date("2026-11-02T18:00:00Z"),
        endAt: new Date("2026-11-02T19:00:00Z"),
        kind: "CUSTOMER",
        usageType: "KOMMERZIELL",
      },
      "2026-11-02",
      TZ,
    );
    expect(interval).toEqual({
      courtId: "c1",
      startMin: 19 * 60,
      endMin: 20 * 60,
      state: "BELEGT",
    });
  });

  it("materialisierte VEREIN-Sperre erhält den Zustand VEREIN", () => {
    const interval = bookingToDayInterval(
      {
        courtId: "c1",
        startAt: new Date("2026-11-02T17:00:00Z"), // 18:00 lokal
        endAt: new Date("2026-11-02T21:00:00Z"), // 22:00 lokal
        kind: "BLOCK",
        usageType: "VEREIN",
      },
      "2026-11-02",
      TZ,
    );
    expect(interval).toEqual({
      courtId: "c1",
      startMin: 18 * 60,
      endMin: 22 * 60,
      state: "VEREIN",
    });
  });

  it("Buchung an anderem Tag → null", () => {
    expect(
      bookingToDayInterval(
        {
          courtId: "c1",
          startAt: new Date("2026-11-03T18:00:00Z"),
          endAt: new Date("2026-11-03T19:00:00Z"),
          kind: "CUSTOMER",
          usageType: "KOMMERZIELL",
        },
        "2026-11-02",
        TZ,
      ),
    ).toBeNull();
  });
});

describe("bookingStateFor", () => {
  it("Blocks nach usageType, alles andere BELEGT", () => {
    expect(bookingStateFor("BLOCK", "VEREIN")).toBe("VEREIN");
    expect(bookingStateFor("BLOCK", "LIGA")).toBe("VEREIN");
    expect(bookingStateFor("BLOCK", "INTERN")).toBe("GESPERRT");
    expect(bookingStateFor("CUSTOMER", "KOMMERZIELL")).toBe("BELEGT");
    expect(bookingStateFor("SUBSCRIPTION", "KOMMERZIELL")).toBe("BELEGT");
  });
});
