import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import {
  computePrice,
  computeSubscriptionPrice,
  listOccurrences,
  splitGross,
  type PriceRuleInput,
} from "./pricing";

const TZ = "Europe/Berlin";

// Regelwerk analog Seed: Off-Peak/Peak Mo–Fr, Wochenende (Brutto-Cent/h)
const offPeak: PriceRuleInput = {
  id: "off-peak",
  courtIds: [],
  weekdays: [1, 2, 3, 4, 5],
  timeFrom: "08:00",
  timeTo: "17:00",
  pricePerHourCents: 2600,
  memberPricePerHourCents: 2200,
  priority: 10,
  active: true,
};
const peak: PriceRuleInput = {
  id: "peak",
  courtIds: [],
  weekdays: [1, 2, 3, 4, 5],
  timeFrom: "17:00",
  timeTo: "22:00",
  pricePerHourCents: 3400,
  memberPricePerHourCents: 2900,
  priority: 20,
  active: true,
};
const weekend: PriceRuleInput = {
  id: "weekend",
  courtIds: [],
  weekdays: [6, 7],
  timeFrom: "09:00",
  timeTo: "21:00",
  pricePerHourCents: 3000,
  memberPricePerHourCents: null,
  priority: 20,
  active: true,
};
const RULES = [offPeak, peak, weekend];

// Lokale Berliner Zeit als UTC-Instant
function at(y: number, mon: number, d: number, h: number, min = 0): Date {
  return new Date(new TZDate(y, mon - 1, d, h, min, TZ).getTime());
}

function price(
  startAt: Date,
  endAt: Date,
  opts: { isMember?: boolean; rules?: PriceRuleInput[]; courtId?: string } = {},
) {
  return computePrice({
    slotMinutes: 30,
    timezone: TZ,
    rules: opts.rules ?? RULES,
    courtId: opts.courtId ?? "c1",
    startAt,
    endAt,
    isMember: opts.isMember ?? false,
  });
}

describe("computePrice", () => {
  // Mo 02.11.2026 (CET)
  it("1 h Peak am Montagabend", () => {
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20));
    expect(r.grossCents).toBe(3400);
  });

  it("Breakdown enthält je 30-min-Slot einen Eintrag", () => {
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20));
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown.map((s) => s.slotCents)).toEqual([1700, 1700]);
    expect(r.breakdown[0]?.ruleId).toBe("peak");
  });

  it("1 h Off-Peak am Vormittag", () => {
    const r = price(at(2026, 11, 2, 10), at(2026, 11, 2, 11));
    expect(r.grossCents).toBe(2600);
  });

  it("Fenstergrenze 17:00: Slot 16:30 Off-Peak, Slot 17:00 Peak", () => {
    const r = price(at(2026, 11, 2, 16, 30), at(2026, 11, 2, 17, 30));
    expect(r.breakdown.map((s) => s.ruleId)).toEqual(["off-peak", "peak"]);
    expect(r.grossCents).toBe(1300 + 1700);
  });

  it("Mitgliederpreis greift", () => {
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20), {
      isMember: true,
    });
    expect(r.grossCents).toBe(2900);
  });

  it("Mitglied ohne Mitgliederpreis in der Regel zahlt Normalpreis", () => {
    // Sa 07.11.2026, weekend hat keinen memberPrice
    const r = price(at(2026, 11, 7, 10), at(2026, 11, 7, 11), {
      isMember: true,
    });
    expect(r.grossCents).toBe(3000);
  });

  it("Wochenendregel am Samstag", () => {
    const r = price(at(2026, 11, 7, 10), at(2026, 11, 7, 11));
    expect(r.breakdown[0]?.ruleId).toBe("weekend");
    expect(r.grossCents).toBe(3000);
  });

  it("höchste Priorität gewinnt (Court-Sonderregel)", () => {
    const special: PriceRuleInput = {
      ...peak,
      id: "court1-special",
      courtIds: ["c1"],
      pricePerHourCents: 5000,
      priority: 30,
    };
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20), {
      rules: [...RULES, special],
    });
    expect(r.breakdown[0]?.ruleId).toBe("court1-special");
    expect(r.grossCents).toBe(5000);
  });

  it("courtIds-Filter: Sonderregel gilt nicht für andere Plätze", () => {
    const special: PriceRuleInput = {
      ...peak,
      id: "court1-special",
      courtIds: ["c1"],
      pricePerHourCents: 5000,
      priority: 30,
    };
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20), {
      rules: [...RULES, special],
      courtId: "c2",
    });
    expect(r.grossCents).toBe(3400);
  });

  it("kein Treffer → DomainError NO_PRICE_RULE", () => {
    expect(() => price(at(2026, 11, 2, 22, 30), at(2026, 11, 2, 23))).toThrow(
      DomainError,
    );
    try {
      price(at(2026, 11, 2, 22, 30), at(2026, 11, 2, 23));
    } catch (e) {
      expect((e as DomainError).code).toBe("NO_PRICE_RULE");
    }
  });

  it("inaktive Regeln werden ignoriert", () => {
    const r = () =>
      price(at(2026, 11, 2, 19), at(2026, 11, 2, 20), {
        rules: [{ ...peak, active: false }],
      });
    expect(r).toThrow(DomainError);
  });

  it("Ende vor Beginn → INVALID_PERIOD", () => {
    try {
      price(at(2026, 11, 2, 20), at(2026, 11, 2, 19));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("INVALID_PERIOD");
    }
  });

  it("kein Vielfaches des Rasters → INVALID_PERIOD", () => {
    try {
      price(at(2026, 11, 2, 19), at(2026, 11, 2, 19, 45));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("INVALID_PERIOD");
    }
  });

  it("rundet je Slot, nicht auf der Summe", () => {
    const odd: PriceRuleInput = {
      ...peak,
      id: "odd",
      pricePerHourCents: 3333,
      priority: 99,
    };
    const r = price(at(2026, 11, 2, 19), at(2026, 11, 2, 20), {
      rules: [odd],
    });
    // 3333/2 = 1666,5 → je Slot 1667; Summe 3334 (≠ round(3333))
    expect(r.breakdown.map((s) => s.slotCents)).toEqual([1667, 1667]);
    expect(r.grossCents).toBe(3334);
  });

  it("Zeitumstellungstag 25.10.2026: lokale Zeit zählt", () => {
    // Sonntag; 19:00 lokal ist nach Umstellung CET (+01) → 18:00Z
    const start = at(2026, 10, 25, 19);
    expect(start.toISOString()).toBe("2026-10-25T18:00:00.000Z");
    const r = price(start, at(2026, 10, 25, 20));
    expect(r.breakdown[0]?.ruleId).toBe("weekend");
    expect(r.grossCents).toBe(3000);
  });
});

describe("splitGross", () => {
  it("19 % aus 3400 Brutto: 2857 netto + 543 Steuer", () => {
    expect(splitGross(3400, 1900)).toEqual({ netCents: 2857, taxCents: 543 });
  });

  it("Summe von Netto und Steuer ergibt immer das Brutto", () => {
    for (const gross of [1, 99, 2600, 3001, 123456]) {
      const { netCents, taxCents } = splitGross(gross, 1900);
      expect(netCents + taxCents).toBe(gross);
    }
  });
});

describe("listOccurrences", () => {
  it("Sonntage im Oktober 2026 inkl. Zeitumstellung: lokale 19:00 bleibt stabil", () => {
    const occ = listOccurrences({
      timezone: TZ,
      weekday: 7,
      startTime: "19:00",
      durationMin: 60,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    expect(occ.map((o) => o.date)).toEqual([
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
    // vor der Umstellung CEST (+02) → 17:00Z, am 25.10. CET (+01) → 18:00Z
    expect(occ[2]?.startAt.toISOString()).toBe("2026-10-18T17:00:00.000Z");
    expect(occ[3]?.startAt.toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });

  it("Schließtage werden ausgelassen", () => {
    const occ = listOccurrences({
      timezone: TZ,
      weekday: 7,
      startTime: "19:00",
      durationMin: 60,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      excludedDates: ["2026-10-11"],
    });
    expect(occ.map((o) => o.date)).toEqual([
      "2026-10-04",
      "2026-10-18",
      "2026-10-25",
    ]);
  });

  it("Donnerstage im Oktober 2026 (Ränder inklusive)", () => {
    const occ = listOccurrences({
      timezone: TZ,
      weekday: 4,
      startTime: "18:00",
      durationMin: 240,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    expect(occ).toHaveLength(5); // 1., 8., 15., 22., 29.
    expect(occ[0]?.date).toBe("2026-10-01");
  });

  it("ungültige Parameter → INVALID_PERIOD", () => {
    expect(() =>
      listOccurrences({
        timezone: TZ,
        weekday: 8,
        startTime: "19:00",
        durationMin: 60,
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
      }),
    ).toThrow(DomainError);
    expect(() =>
      listOccurrences({
        timezone: TZ,
        weekday: 1,
        startTime: "19:00",
        durationMin: 60,
        dateFrom: "2026-11-01",
        dateTo: "2026-10-01",
      }),
    ).toThrow(DomainError);
  });
});

describe("computeSubscriptionPrice", () => {
  it("10 % Rabatt auf 10 Termine à 3400", () => {
    const r = computeSubscriptionPrice({
      occurrenceGrossCents: Array(10).fill(3400),
      discountBp: 1000,
    });
    expect(r.totalCents).toBe(30600);
    expect(r.perOccurrenceCents).toBe(3060);
    expect(r.lastOccurrenceCents).toBe(3060);
    expect(r.discountCents).toBe(3400);
  });

  it("Rundungsrest landet auf dem letzten Termin", () => {
    const r = computeSubscriptionPrice({
      occurrenceGrossCents: [3334, 3333, 3333],
      discountBp: 0,
    });
    expect(r.totalCents).toBe(10000);
    expect(r.perOccurrenceCents).toBe(3333);
    expect(r.lastOccurrenceCents).toBe(3334);
    expect(r.perOccurrenceCents * 2 + r.lastOccurrenceCents).toBe(10000);
  });

  it("ohne Termine → INVALID_PERIOD", () => {
    expect(() =>
      computeSubscriptionPrice({ occurrenceGrossCents: [], discountBp: 0 }),
    ).toThrow(DomainError);
  });
});
