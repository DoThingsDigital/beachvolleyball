import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import {
  assertBookingTransition,
  assertOrderTransition,
  assertSubscriptionTransition,
} from "./state-machines";

describe("Zustandsautomaten", () => {
  it("Booking: gültige Übergänge werfen nicht", () => {
    expect(() => assertBookingTransition("HOLD", "CONFIRMED")).not.toThrow();
    expect(() => assertBookingTransition("HOLD", "EXPIRED")).not.toThrow();
    expect(() =>
      assertBookingTransition("PENDING_PAYMENT", "CONFIRMED"),
    ).not.toThrow();
    expect(() => assertBookingTransition("CONFIRMED", "RELEASED")).not.toThrow();
    expect(() => assertBookingTransition("CONFIRMED", "NO_SHOW")).not.toThrow();
  });

  it("Booking: Endzustände sind endgültig", () => {
    for (const from of ["CANCELLED", "EXPIRED", "RELEASED", "NO_SHOW"] as const) {
      expect(() => assertBookingTransition(from, "CONFIRMED")).toThrow(
        DomainError,
      );
    }
  });

  it("Order: SEPA-Pfad AWAITING_PAYMENT → PROCESSING → PAID/FAILED", () => {
    expect(() =>
      assertOrderTransition("AWAITING_PAYMENT", "PROCESSING"),
    ).not.toThrow();
    expect(() => assertOrderTransition("PROCESSING", "PAID")).not.toThrow();
    expect(() => assertOrderTransition("PROCESSING", "FAILED")).not.toThrow();
    expect(() => assertOrderTransition("PAID", "AWAITING_PAYMENT")).toThrow(
      DomainError,
    );
  });

  it("Order: Erstattungspfad", () => {
    expect(() => assertOrderTransition("PAID", "PARTIALLY_REFUNDED")).not.toThrow();
    expect(() =>
      assertOrderTransition("PARTIALLY_REFUNDED", "REFUNDED"),
    ).not.toThrow();
    expect(() => assertOrderTransition("REFUNDED", "PAID")).toThrow(DomainError);
  });

  it("Subscription: PENDING → ACTIVE → CANCELLED, nie zurück", () => {
    expect(() => assertSubscriptionTransition("PENDING", "ACTIVE")).not.toThrow();
    expect(() => assertSubscriptionTransition("ACTIVE", "CANCELLED")).not.toThrow();
    expect(() => assertSubscriptionTransition("CANCELLED", "ACTIVE")).toThrow(
      DomainError,
    );
  });
});
