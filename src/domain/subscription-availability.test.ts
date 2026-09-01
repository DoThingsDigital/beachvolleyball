import { describe, expect, it } from "vitest";

import {
  blockToOccupations,
  computeWeeklyAvailability,
  minToTime,
  parseWeeklyBydays,
  subscriptionToOccupation,
  timeToMin,
  type WeeklyOccupation,
} from "./subscription-availability";

const TZ = "Europe/Berlin";

const openMonday: Record<string, [string, string][]> = {
  mon: [["18:00", "22:00"]],
};

function slots(params: {
  occupations?: WeeklyOccupation[];
  durations?: number[];
  courts?: string[];
  opening?: Record<string, [string, string][]>;
}) {
  return computeWeeklyAvailability({
    slotMinutes: 30,
    openingHours: params.opening ?? openMonday,
    durationsMin: params.durations ?? [60],
    courtIds: params.courts ?? ["c1"],
    occupations: params.occupations ?? [],
  });
}

describe("computeWeeklyAvailability", () => {
  it("freier Platz: alle Starts im Raster bis Fensterende", () => {
    const result = slots({});
    // 18:00–22:00, 60 min, 30er-Raster → 18:00 … 21:00 = 7 Starts
    expect(result.map((s) => s.startTime)).toEqual([
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
    ]);
  });

  it("Belegung blockiert alle überlappenden Starts, Angrenzung bleibt frei", () => {
    const occ: WeeklyOccupation = {
      courtId: "c1",
      weekday: 1,
      startMin: timeToMin("19:00"),
      endMin: timeToMin("20:00"),
    };
    const result = slots({ occupations: [occ] });
    expect(result.map((s) => s.startTime)).toEqual([
      "18:00",
      "20:00",
      "20:30",
      "21:00",
    ]);
  });

  it("längere Dauern brauchen mehr Platz vor dem Fensterende", () => {
    const result = slots({ durations: [120] });
    expect(result.map((s) => s.startTime)).toEqual([
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
    ]);
  });

  it("Belegung auf anderem Platz stört nicht", () => {
    const occ: WeeklyOccupation = {
      courtId: "c2",
      weekday: 1,
      startMin: timeToMin("18:00"),
      endMin: timeToMin("22:00"),
    };
    const result = slots({ occupations: [occ], courts: ["c1", "c2"] });
    expect(result.filter((s) => s.courtId === "c1")).toHaveLength(7);
    expect(result.filter((s) => s.courtId === "c2")).toHaveLength(0);
  });

  it("Belegung an anderem Wochentag stört nicht", () => {
    const occ: WeeklyOccupation = {
      courtId: "c1",
      weekday: 2,
      startMin: timeToMin("18:00"),
      endMin: timeToMin("22:00"),
    };
    expect(slots({ occupations: [occ] })).toHaveLength(7);
  });

  it("Tag ohne Öffnungsfenster liefert nichts", () => {
    expect(slots({ opening: { tue: [] } })).toHaveLength(0);
  });

  it("Performance: volle Woche, 4 Plätze, 3 Dauern, 200 Belegungen < 300 ms", () => {
    const opening: Record<string, [string, string][]> = {
      mon: [["08:00", "22:00"]],
      tue: [["08:00", "22:00"]],
      wed: [["08:00", "22:00"]],
      thu: [["08:00", "22:00"]],
      fri: [["08:00", "22:00"]],
      sat: [["09:00", "21:00"]],
      sun: [["09:00", "21:00"]],
    };
    const occupations: WeeklyOccupation[] = Array.from(
      { length: 200 },
      (_, i) => ({
        courtId: `c${(i % 4) + 1}`,
        weekday: (i % 7) + 1,
        startMin: 480 + (i % 24) * 30,
        endMin: 480 + (i % 24) * 30 + 60,
      }),
    );
    const start = performance.now();
    const result = computeWeeklyAvailability({
      slotMinutes: 30,
      openingHours: opening,
      durationsMin: [60, 90, 120],
      courtIds: ["c1", "c2", "c3", "c4"],
      occupations,
    });
    const elapsed = performance.now() - start;
    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});

describe("Belegungsquellen", () => {
  it("Subscription → Wochenbelegung", () => {
    expect(
      subscriptionToOccupation({
        courtId: "c1",
        weekday: 4,
        startTime: "19:00",
        durationMin: 90,
      }),
    ).toEqual({ courtId: "c1", weekday: 4, startMin: 1140, endMin: 1230 });
  });

  it("Vereinskontingent-Block (RRULE Mo–Do) → vier Wochenbelegungen in lokaler Zeit", () => {
    const occs = blockToOccupations(
      {
        courtId: "c1",
        // 18:00–22:00 lokal am 01.10.2026 (CEST, +02:00)
        startAt: new Date("2026-10-01T16:00:00Z"),
        endAt: new Date("2026-10-01T20:00:00Z"),
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20270331T215959Z",
      },
      TZ,
    );
    expect(occs).toHaveLength(4);
    expect(occs.map((o) => o.weekday)).toEqual([1, 2, 3, 4]);
    expect(occs[0]).toMatchObject({
      startMin: timeToMin("18:00"),
      endMin: timeToMin("22:00"),
    });
  });

  it("einmaliger Block (ohne RRULE) sperrt keinen Wochenslot", () => {
    expect(
      blockToOccupations(
        {
          courtId: "c1",
          startAt: new Date("2026-11-03T10:00:00Z"),
          endAt: new Date("2026-11-03T12:00:00Z"),
          rrule: null,
        },
        TZ,
      ),
    ).toEqual([]);
  });

  it("parseWeeklyBydays: nur einfaches wöchentliches Muster", () => {
    expect(parseWeeklyBydays("FREQ=WEEKLY;BYDAY=MO,FR")).toEqual([1, 5]);
    expect(parseWeeklyBydays("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")).toBeNull();
    expect(parseWeeklyBydays("FREQ=MONTHLY;BYDAY=MO")).toBeNull();
    expect(parseWeeklyBydays(null)).toBeNull();
  });

  it("minToTime/timeToMin sind invers", () => {
    for (const t of ["00:00", "08:30", "19:00", "23:30"]) {
      expect(minToTime(timeToMin(t))).toBe(t);
    }
  });
});
