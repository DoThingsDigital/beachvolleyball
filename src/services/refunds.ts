import { renderToBuffer } from "@react-pdf/renderer";

import { formatCents, formatDate } from "@/lib/format";
import {
  createInvoiceWithNumber,
  findInvoiceForOrder,
  findLegalEntityById,
  findOrderForInvoicing,
} from "@/src/db/invoices";
import { transitionOrder } from "@/src/db/orders";
import {
  createRefundRecord,
  findSucceededPayment,
  sumActiveRefunds,
} from "@/src/db/refunds";
import { DomainError } from "@/src/domain/errors";
import { splitGross } from "@/src/domain/pricing";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  REFUND_MAIL_TEMPLATE,
  REFUND_MAIL_VERSION,
  RefundMail,
} from "@/src/email/templates/refund-mail.v1";
import { InvoicePdf, type InvoicePdfData } from "@/src/pdf/invoice.v1";
import { readInvoicePdf, storeInvoicePdf } from "./storage";
import { getStripe } from "./stripe";

// Admin-Erstattung (Ticket 3.3, H3/I1): ganz oder teilweise über Stripe.
// Jede Erstattung erzeugt eine Gutschrift (CREDIT_NOTE) mit Bezug auf die
// Ursprungsrechnung – Rechnungen selbst bleiben unveränderlich. Bookings
// bleiben hier unberührt; Kündigungen (F4/I3) nutzen diesen Service.

export async function refundOrder(params: {
  orderId: string;
  /** undefined = kompletter Restbetrag */
  amountCents?: number;
  reason: string;
  actorUserId: string;
}) {
  const order = await findOrderForInvoicing(params.orderId);
  if (!order) throw new DomainError("NOT_FOUND", "Bestellung nicht gefunden.");
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Erstattung nur für bezahlte Bestellungen (Status: ${order.status}).`,
    );
  }

  const alreadyRefunded = await sumActiveRefunds(order.id);
  const remaining = order.totalCents - alreadyRefunded;
  const amountCents = params.amountCents ?? remaining;
  if (amountCents <= 0 || amountCents > remaining) {
    throw new DomainError(
      "INVALID_PERIOD",
      `Betrag muss zwischen 0,01 € und ${formatCents(remaining)} liegen.`,
    );
  }

  const payment = await findSucceededPayment(order.id);
  if (!payment?.providerRef) {
    throw new DomainError("NOT_FOUND", "Keine erfolgreiche Stripe-Zahlung gefunden.");
  }
  const originalInvoice = await findInvoiceForOrder(order.id, "INVOICE");
  if (!originalInvoice) {
    throw new DomainError("NOT_FOUND", "Ursprungsrechnung nicht gefunden.");
  }
  const issuer = await findLegalEntityById(originalInvoice.legalEntityId);
  if (!issuer) {
    throw new DomainError("NOT_FOUND", "Aussteller nicht gefunden.");
  }

  // 1) Gutschrift erzeugen (eigene Nummer im selben Nummernkreis)
  const { netCents, taxCents } = splitGross(amountCents, originalInvoice.taxRateBp);
  const issueDate = new Date();
  const description = `Gutschrift zu Rechnung ${originalInvoice.number} – ${params.reason}`;

  const pdfBase: Omit<InvoicePdfData, "number"> = {
    type: "CREDIT_NOTE",
    issueDateFormatted: formatDate(issueDate),
    servicePeriodFormatted: `${formatDate(originalInvoice.servicePeriodFrom)} – ${formatDate(originalInvoice.servicePeriodTo)}`,
    orderNumber: order.number,
    relatedInvoiceNumber: originalInvoice.number,
    issuer: originalInvoice.issuerSnapshot as InvoicePdfData["issuer"],
    recipient: originalInvoice.recipientSnapshot as InvoicePdfData["recipient"],
    lines: [
      {
        description,
        quantity: 1,
        netFormatted: formatCents(netCents),
        taxRateLabel: `${(originalInvoice.taxRateBp / 100).toLocaleString("de-DE")} %`,
        grossFormatted: formatCents(amountCents),
      },
    ],
    totals: {
      netFormatted: formatCents(netCents),
      taxFormatted: formatCents(taxCents),
      grossFormatted: formatCents(amountCents),
      taxRateLabel: `${(originalInvoice.taxRateBp / 100).toLocaleString("de-DE")} %`,
    },
    paymentNote: "Der Betrag wird auf das ursprüngliche Zahlungsmittel erstattet.",
  };

  const creditNote = await createInvoiceWithNumber(
    {
      organisationId: order.organisationId,
      legalEntityId: issuer.id,
      invoicePrefix: issuer.invoicePrefix,
      type: "CREDIT_NOTE",
      orderId: order.id,
      userId: order.userId,
      relatedInvoiceId: originalInvoice.id,
      issueDate,
      servicePeriodFrom: originalInvoice.servicePeriodFrom,
      servicePeriodTo: originalInvoice.servicePeriodTo,
      issuerSnapshot: originalInvoice.issuerSnapshot as object,
      recipientSnapshot: originalInvoice.recipientSnapshot as object,
      lines: [
        {
          description,
          quantity: 1,
          netCents,
          taxRateBp: originalInvoice.taxRateBp,
          taxCents,
          grossCents: amountCents,
        },
      ],
      netCents,
      taxCents,
      grossCents: amountCents,
      taxRateBp: originalInvoice.taxRateBp,
    },
    async (number) => {
      const buffer = await renderToBuffer(
        InvoicePdf({ data: { ...pdfBase, number } }),
      );
      const year = issueDate.getUTCFullYear();
      return storeInvoicePdf(`${issuer.id}/${year}/${number}.pdf`, buffer);
    },
  );

  // 2) Stripe-Refund auslösen und verzeichnen
  const stripeRefund = await getStripe().refunds.create({
    payment_intent: payment.providerRef,
    amount: amountCents,
    metadata: { orderId: order.id, creditNote: creditNote.number },
  });
  await createRefundRecord({
    paymentId: payment.id,
    orderId: order.id,
    amountCents,
    reason: params.reason,
    providerRef: stripeRefund.id,
    createdByUserId: params.actorUserId,
    creditNoteInvoiceId: creditNote.id,
  });

  // 3) Bestellstatus fortschreiben
  const totalRefunded = alreadyRefunded + amountCents;
  if (totalRefunded >= order.totalCents) {
    await transitionOrder(order.id, ["PAID"], { status: "PARTIALLY_REFUNDED" });
    await transitionOrder(order.id, ["PARTIALLY_REFUNDED"], {
      status: "REFUNDED",
    });
  } else {
    await transitionOrder(order.id, ["PAID"], { status: "PARTIALLY_REFUNDED" });
  }

  // 4) Kunden informieren (J1) mit Gutschrifts-PDF
  const pdf = await readInvoicePdf(creditNote.pdfKey);
  await sendEmail({
    to: order.user.email,
    subject: `Gutschrift ${creditNote.number}`,
    react: RefundMail({
      brandName: getBrandName(),
      creditNoteNumber: creditNote.number,
      amountFormatted: formatCents(amountCents),
      orderNumber: order.number,
    }),
    template: REFUND_MAIL_TEMPLATE,
    templateVersion: REFUND_MAIL_VERSION,
    userId: order.userId,
    refType: "invoice",
    refId: creditNote.id,
    attachments: [
      { filename: `Gutschrift-${creditNote.number}.pdf`, content: pdf },
    ],
  });

  return { creditNote, refundProviderRef: stripeRefund.id, amountCents };
}
