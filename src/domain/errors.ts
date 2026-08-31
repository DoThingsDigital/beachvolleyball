export type DomainErrorCode =
  | "SLOT_TAKEN"
  | "OUTSIDE_OPENING_HOURS"
  | "NO_PRICE_RULE"
  | "INVALID_PERIOD"
  | "INVALID_TRANSITION";

// Fachliche Fehler tragen einen stabilen Code; Stacktraces bleiben serverseitig.
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
