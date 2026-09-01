import { DomainError } from "./errors";

// Zustandsautomaten (Invariante 8, docs/02_DATENMODELL.md).
// Alle Statusübergänge laufen über diese Funktionen; ungültige werfen.

type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!map[from]?.includes(to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `${entity}: Übergang ${from} → ${to} ist nicht erlaubt.`,
    );
  }
}

// --- Booking ---------------------------------------------------------------

export type BookingState =
  | "HOLD"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "RELEASED"
  | "CANCELLED"
  | "EXPIRED"
  | "NO_SHOW";

const BOOKING_TRANSITIONS: TransitionMap<BookingState> = {
  HOLD: ["PENDING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "NO_SHOW", "RELEASED"],
  RELEASED: [],
  CANCELLED: [],
  EXPIRED: [],
  NO_SHOW: [],
};

export function assertBookingTransition(
  from: BookingState,
  to: BookingState,
): void {
  assertTransition("Booking", BOOKING_TRANSITIONS, from, to);
}

// --- Order -----------------------------------------------------------------

export type OrderState =
  | "DRAFT"
  | "AWAITING_PAYMENT"
  | "PROCESSING"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED"
  | "CANCELLED";

const ORDER_TRANSITIONS: TransitionMap<OrderState> = {
  DRAFT: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PROCESSING", "PAID", "CANCELLED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  REFUNDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertOrderTransition(from: OrderState, to: OrderState): void {
  assertTransition("Order", ORDER_TRANSITIONS, from, to);
}

// --- Subscription ----------------------------------------------------------

export type SubscriptionState = "PENDING" | "ACTIVE" | "CANCELLED";

const SUBSCRIPTION_TRANSITIONS: TransitionMap<SubscriptionState> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["CANCELLED"],
  CANCELLED: [],
};

export function assertSubscriptionTransition(
  from: SubscriptionState,
  to: SubscriptionState,
): void {
  assertTransition("Subscription", SUBSCRIPTION_TRANSITIONS, from, to);
}
