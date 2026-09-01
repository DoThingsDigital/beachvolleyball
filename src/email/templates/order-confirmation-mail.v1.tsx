import { EmailLayout, emailStyles } from "./layout.v1";

export const ORDER_CONFIRMATION_TEMPLATE = "order-confirmation";
export const ORDER_CONFIRMATION_VERSION = "v1";

export function OrderConfirmationMail({
  brandName,
  orderNumber,
  description,
  totalFormatted,
  orderUrl,
}: {
  brandName: string;
  orderNumber: string;
  description: string;
  totalFormatted: string;
  orderUrl: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>Vielen Dank für deine Bestellung!</p>
      <p style={emailStyles.text}>
        <strong>{description}</strong>
        <br />
        Bestellnummer {orderNumber} · Gesamtbetrag {totalFormatted}
      </p>
      <p style={emailStyles.text}>
        Deine Termine sind verbindlich gebucht. Die Rechnung erhältst du in
        einer separaten E-Mail.
      </p>
      <a href={orderUrl} style={emailStyles.button}>
        Bestellung ansehen
      </a>
    </EmailLayout>
  );
}
