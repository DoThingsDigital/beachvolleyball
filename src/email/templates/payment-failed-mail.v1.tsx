import { EmailLayout, emailStyles } from "./layout.v1";

export const PAYMENT_FAILED_TEMPLATE = "payment-failed";
export const PAYMENT_FAILED_VERSION = "v1";

export function PaymentFailedMail({
  brandName,
  orderNumber,
  wasConfirmed,
}: {
  brandName: string;
  orderNumber: string;
  /** true = Rücklastschrift nach Bestätigung, Termine wurden storniert */
  wasConfirmed: boolean;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        die Zahlung zu deiner Bestellung {orderNumber} ist fehlgeschlagen.
      </p>
      {wasConfirmed ? (
        <p style={emailStyles.text}>
          Deine gebuchten Termine mussten deshalb storniert werden.
          SEPA-Lastschrift steht für dein Konto vorerst nicht mehr zur
          Verfügung – bei einer neuen Buchung kannst du per Karte zahlen.
          Bereits gestellte Rechnungen gleichen wir per Gutschrift aus.
        </p>
      ) : (
        <p style={emailStyles.text}>
          Die reservierten Termine wurden wieder freigegeben. Du kannst die
          Buchung jederzeit erneut versuchen.
        </p>
      )}
      <p style={emailStyles.text}>
        Bei Fragen antworte einfach auf diese E-Mail.
      </p>
    </EmailLayout>
  );
}
