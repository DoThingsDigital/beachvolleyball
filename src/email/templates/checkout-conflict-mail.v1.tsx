import { EmailLayout, emailStyles } from "./layout.v1";

export const CHECKOUT_CONFLICT_TEMPLATE = "checkout-conflict";
export const CHECKOUT_CONFLICT_VERSION = "v1";

// G6: Zahlung ging nach Ablauf der Reservierung ein – Slot ggf. vergeben.
export function CheckoutConflictMail({
  brandName,
  orderNumber,
  totalFormatted,
}: {
  brandName: string;
  orderNumber: string;
  totalFormatted: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        deine Zahlung zur Bestellung {orderNumber} ist eingegangen, nachdem
        die Reservierung deiner Termine bereits abgelaufen war.
      </p>
      <p style={emailStyles.text}>
        Damit es keine Doppelbuchung gibt, haben wir die Bestellung storniert
        und den vollen Betrag von {totalFormatted} erstattet. Die
        Rückerstattung dauert je nach Zahlungsart einige Bankarbeitstage.
      </p>
      <p style={emailStyles.text}>
        Du kannst deinen Wunschtermin jederzeit neu buchen – wir entschuldigen
        uns für die Umstände.
      </p>
    </EmailLayout>
  );
}
