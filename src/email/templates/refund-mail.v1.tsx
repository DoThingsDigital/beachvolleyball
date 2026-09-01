import { EmailLayout, emailStyles } from "./layout.v1";

export const REFUND_MAIL_TEMPLATE = "refund";
export const REFUND_MAIL_VERSION = "v1";

export function RefundMail({
  brandName,
  creditNoteNumber,
  amountFormatted,
  orderNumber,
}: {
  brandName: string;
  creditNoteNumber: string;
  amountFormatted: string;
  orderNumber: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        zu deiner Bestellung {orderNumber} haben wir {amountFormatted}
        {" "}erstattet. Die Gutschrift {creditNoteNumber} findest du im Anhang.
      </p>
      <p style={emailStyles.text}>
        Die Rückerstattung erfolgt auf das ursprüngliche Zahlungsmittel und
        dauert je nach Bank einige Werktage.
      </p>
    </EmailLayout>
  );
}
