import { EmailLayout, emailStyles } from "./layout.v1";

export const MASS_CANCELLATION_TEMPLATE = "mass-cancellation";
export const MASS_CANCELLATION_VERSION = "v1";

// Sammelmail Betreiber-Massenstorno (Ticket 5.6, I3): ein Kunde bekommt
// EINE Mail mit allen betroffenen Terminen und der Erstattungsinfo.

export function MassCancellationMail({
  brandName,
  reason,
  bookings,
  refundText,
}: {
  brandName: string;
  reason: string;
  /** z. B. "Feld 1, Mo 02.11.2026, 19:00 Uhr" */
  bookings: string[];
  refundText: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        leider müssen wir folgende Termine absagen: <strong>{reason}</strong>
      </p>
      <ul>
        {bookings.map((b) => (
          <li key={b} style={emailStyles.text}>
            {b}
          </li>
        ))}
      </ul>
      <p style={emailStyles.text}>{refundText}</p>
      <p style={emailStyles.text}>
        Wir entschuldigen uns für die Unannehmlichkeiten.
      </p>
    </EmailLayout>
  );
}
