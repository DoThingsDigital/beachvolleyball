import { describe, expect, it } from "vitest";

// Platzhalter: beweist, dass die Vitest-Pipeline läuft (Ticket 0.2).
// Echte Domain-Tests (Pricing, Konflikte, Nummernkreis) folgen ab Sprint 1.
describe("setup", () => {
  it("führt Tests aus", () => {
    expect(1 + 1).toBe(2);
  });
});
