import { EmailLayout, emailStyles } from "./layout.v1";

export const INVOICE_MAIL_TEMPLATE = "invoice";
export const INVOICE_MAIL_VERSION = "v1";

export function InvoiceMail({
  brandName,
  invoiceNumber,
  totalFormatted,
}: {
  brandName: string;
  invoiceNumber: string;
  totalFormatted: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        anbei erhältst du deine Rechnung {invoiceNumber} über {totalFormatted}
        {" "}als PDF.
      </p>
      <p style={emailStyles.text}>
        Du findest die Rechnung außerdem jederzeit in deinem Konto unter der
        zugehörigen Bestellung.
      </p>
    </EmailLayout>
  );
}
