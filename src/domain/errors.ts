export type DomainErrorCode =
  | "SLOT_TAKEN"
  | "OUTSIDE_OPENING_HOURS"
  | "NO_PRICE_RULE"
  | "INVALID_PERIOD"
  | "INVALID_TRANSITION"
  | "SEASON_NOT_BOOKABLE"
  | "BILLING_ADDRESS_REQUIRED"
  | "CANCEL_DEADLINE_PASSED"
  | "INSUFFICIENT_CREDIT"
  | "MEMBERS_ONLY"
  | "NOT_FOUND";

// Fachliche Fehler tragen einen stabilen Code; Stacktraces bleiben serverseitig.
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
