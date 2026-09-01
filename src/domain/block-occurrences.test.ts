import { describe, expect, it } from "vitest";

import {
  listBlockOccurrences,
  parseUntil,
  usageTypeForBlockType,
} from "./block-occurrences";

// Ticket 5.1: Expansion von Block-Regeln in konkrete Termine.
// Referenzserie = Seed-Kontingent: Mo–Do 18–22 Uhr ab Do 01.10.2026 (CEST).

const TZ = "Europe/Berlin";

const kontingent = {
  startAt: new Date("2026-10-01T18:00:00+02:00"),
  endAt: new Date("2026-10-01T22:00:00+02:00"),
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20270331T215959Z",
};

function iso(d: Date): string {
  return d.toISOString();
}

describe("parseUntil", () => {
  it("liest UTC-Instants und reine Datumsangaben", () => {
    expect(iso(parseUntil("FREQ=WEEKLY;UNTIL=20270331T215959Z")!)).toBe(
      "2027-03-31T21:59:59.000Z",
    );
    expect(iso(parseUntil("FREQ=WEEKLY;BYDAY=MO;UNTIL=20270331")!)).toBe(
      "2027-03-31T23:59:59.000Z",
    );
    expect(parseUntil("FREQ=WEEKLY;BYDAY=MO")).toBeNull();
    expect(parseUntil(null)).toBeNull();
  });
});

describe("listBlockOccurrences", () => {
  it("erste Woche: Do, dann Mo–Do (Serie beginnt am startAt)", () => {
    const occ = listBlockOccurrences({
      block: kontingent,
      timezone: TZ,
      windowFrom: new Date("2026-09-01T00:00:00Z"),
      windowTo: new Date("2026-10-09T00:00:00Z"),
    });
    expect(occ.map((o) => iso(o.startAt))).toEqual([
      "2026-10-01T16:00:00.000Z", // Do 01.10. 18:00 CEST
      "2026-10-05T16:00:00.000Z", // Mo
      "2026-10-06T16:00:00.000Z", // Di
      "2026-10-07T16:00:00.000Z", // Mi
      "2026-10-08T16:00:00.000Z", // Do
    ]);
    expect(iso(occ[0]!.endAt)).toBe("2026-10-01T20:00:00.000Z");
  });

  it("Zeitumstellung 25.10.2026: Wandzeit 18:00 bleibt, UTC-Offset wechselt", () => {
    const occ = listBlockOccurrences({
      block: kontingent,
      timezone: TZ,
      windowFrom: new Date("2026-10-19T00:00:00Z"),
      windowTo: new Date("2026-10-28T00:00:00Z"),
    });
    // Do 22.10. noch CEST (16:00Z), Mo 26.10. schon CET (17:00Z)
    expect(occ.map((o) => iso(o.startAt))).toContain("2026-10-22T16:00:00.000Z");
    expect(occ.map((o) => iso(o.startAt))).toContain("2026-10-26T17:00:00.000Z");
    const monday = occ.find((o) => iso(o.startAt) === "2026-10-26T17:00:00.000Z")!;
    expect(iso(monday.endAt)).toBe("2026-10-26T21:00:00.000Z"); // 22:00 CET
  });

  it("UNTIL ist inklusiv und beendet die Serie", () => {
    const occ = listBlockOccurrences({
      block: kontingent,
      timezone: TZ,
      windowFrom: new Date("2027-03-22T00:00:00Z"),
      windowTo: new Date("2027-04-30T00:00:00Z"),
    });
    // Letzter Termin: Mi 31.03.2027 18:00 CEST = 16:00Z (UNTIL 21:59:59Z)
    const starts = occ.map((o) => iso(o.startAt));
    expect(starts.at(-1)).toBe("2027-03-31T16:00:00.000Z");
    expect(starts).not.toContain("2027-04-01T16:00:00.000Z");
  });

  it("einmalige Sperre: genau ein Termin, nur wenn sie das Fenster schneidet", () => {
    const wartung = {
      startAt: new Date("2026-11-02T08:00:00+01:00"),
      endAt: new Date("2026-11-02T12:00:00+01:00"),
      rrule: null,
    };
    expect(
      listBlockOccurrences({
        block: wartung,
        timezone: TZ,
        windowFrom: new Date("2026-11-01T00:00:00Z"),
        windowTo: new Date("2026-11-30T00:00:00Z"),
      }),
    ).toEqual([{ startAt: wartung.startAt, endAt: wartung.endAt }]);
    expect(
      listBlockOccurrences({
        block: wartung,
        timezone: TZ,
        windowFrom: new Date("2026-12-01T00:00:00Z"),
        windowTo: new Date("2026-12-31T00:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("windowFrom mitten in der Saison schneidet frühere Termine ab", () => {
    const occ = listBlockOccurrences({
      block: kontingent,
      timezone: TZ,
      windowFrom: new Date("2026-10-06T00:00:00Z"),
      windowTo: new Date("2026-10-09T00:00:00Z"),
    });
    expect(occ.map((o) => iso(o.startAt))).toEqual([
      "2026-10-06T16:00:00.000Z",
      "2026-10-07T16:00:00.000Z",
      "2026-10-08T16:00:00.000Z",
    ]);
  });

  it("Serie über Mitternacht wird abgelehnt", () => {
    expect(() =>
      listBlockOccurrences({
        block: {
          startAt: new Date("2026-10-01T22:00:00+02:00"),
          endAt: new Date("2026-10-02T02:00:00+02:00"),
          rrule: "FREQ=WEEKLY;BYDAY=MO",
        },
        timezone: TZ,
        windowFrom: new Date("2026-10-01T00:00:00Z"),
        windowTo: new Date("2026-10-31T00:00:00Z"),
      }),
    ).toThrowError(/Mitternacht/);
  });
});

describe("usageTypeForBlockType", () => {
  it("VEREIN/LIGA erhalten ihren Typ, Rest ist INTERN", () => {
    expect(usageTypeForBlockType("VEREIN")).toBe("VEREIN");
    expect(usageTypeForBlockType("LIGA")).toBe("LIGA");
    expect(usageTypeForBlockType("WARTUNG")).toBe("INTERN");
    expect(usageTypeForBlockType("EVENT")).toBe("INTERN");
    expect(usageTypeForBlockType("GESPERRT")).toBe("INTERN");
  });
});
