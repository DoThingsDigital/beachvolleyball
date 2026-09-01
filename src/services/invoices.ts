import { renderToBuffer } from "@react-pdf/renderer";

import { formatCents, formatDate } from "@/lib/format";
import {
  createInvoiceWithNumber,
  findInvoiceForOrder,
  findInvoiceWithUser,
  findLegalEntityById,
  findOrderForInvoicing,
} from "@/src/db/invoices";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  INVOICE_MAIL_TEMPLATE,
  INVOICE_MAIL_VERSION,
  InvoiceMail,
} from "@/src/email/templates/invoice-mail.v1";
import { readInvoicePdf } from "./storage";
import { DomainError } from "@/src/domain/errors";
import { InvoicePdf, type InvoicePdfData } from "@/src/pdf/invoice.v1";
import { storeInvoicePdf } from "./storage";

// Rechnungserstellung (Ticket 3.1, H1/H2/H5): Snapshots statt Fremdschlüssel,
// Nummernvergabe transaktional (src/db/invoices.ts), PDF + SHA-256 im
// Storage. Idempotent: existiert bereits eine Rechnung zur Bestellung,
// wird sie zurückgegeben (Webhooks dürfen mehrfach feuern).

function taxRateLabel(taxRateBp: number): string {
  return `${(taxRateBp / 100).toLocaleString("de-DE")} %`;
}

// K1: Rechnung/Gutschrift erneut per Mail zustellen (Admin).
export async function resendInvoiceEmail(invoiceId: string) {
  const invoice = await findInvoiceWithUser(invoiceId);
  if (!invoice) throw new DomainError("NOT_FOUND", "Rechnung nicht gefunden.");

  const pdf = await readInvoicePdf(invoice.pdfKey);
  const isCreditNote = invoice.type === "CREDIT_NOTE";
  const result = await sendEmail({
    to: invoice.user.email,
    subject: `${isCreditNote ? "Gutschrift" : "Rechnung"} ${invoice.number}`,
    react: InvoiceMail({
      brandName: getBrandName(),
      invoiceNumber: invoice.number,
      totalFormatted: formatCents(invoice.grossCents),
    }),
    template: INVOICE_MAIL_TEMPLATE,
    templateVersion: INVOICE_MAIL_VERSION,
    userId: invoice.userId,
    refType: "invoice",
    refId: invoice.id,
    attachments: [
      {
        filename: `${isCreditNote ? "Gutschrift" : "Rechnung"}-${invoice.number}.pdf`,
        content: pdf,
      },
    ],
  });
  return { ok: result.ok, number: invoice.number };
}

export async function createInvoiceForOrder(orderId: string) {
  const existing = await findInvoiceForOrder(orderId, "INVOICE");
  if (existing) return existing;

  const order = await findOrderForInvoicing(orderId);
  if (!order) throw new DomainError("NOT_FOUND", "Bestellung nicht gefunden.");
  if (order.status !== "PAID" && order.status !== "PROCESSING") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Rechnung nur für bezahlte Bestellungen (Status: ${order.status}).`,
    );
  }
  const issuer = await findLegalEntityById(order.legalEntityId);
  if (!issuer) {
    throw new DomainError("NOT_FOUND", "Rechnungsaussteller nicht gefunden.");
  }

  const billing = order.billingSnapshot as {
    name?: string | null;
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
  const issueDate = new Date();
  const taxRateBp = order.items[0]?.taxRateBp ?? issuer.defaultTaxRateBp;

  const issuerSnapshot = {
    name: issuer.name,
    legalForm: issuer.legalForm,
    street: issuer.street,
    zip: issuer.zip,
    city: issuer.city,
    country: issuer.country,
    taxNumber: issuer.taxNumber,
    vatId: issuer.vatId,
    email: issuer.email,
    smallBusiness: issuer.smallBusiness,
  };
  const recipientSnapshot = {
    name: billing.name ?? order.user.name ?? order.user.email,
    street: billing.street ?? "",
    zip: billing.zip ?? "",
    city: billing.city ?? "",
    country: billing.country ?? "DE",
    email: order.user.email,
  };
  const lines = order.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    netCents: item.netCents,
    taxRateBp: item.taxRateBp,
    taxCents: item.taxCents,
    grossCents: item.grossCents,
    servicePeriodFrom: item.servicePeriodFrom.toISOString(),
    servicePeriodTo: item.servicePeriodTo.toISOString(),
  }));

  const servicePeriodFrom = order.items[0]?.servicePeriodFrom ?? issueDate;
  const servicePeriodTo = order.items[0]?.servicePeriodTo ?? issueDate;

  const pdfData: Omit<InvoicePdfData, "number"> = {
    type: "INVOICE",
    issueDateFormatted: formatDate(issueDate),
    servicePeriodFormatted: `${formatDate(servicePeriodFrom)} – ${formatDate(servicePeriodTo)}`,
    orderNumber: order.number,
    issuer: issuerSnapshot,
    recipient: recipientSnapshot,
    lines: order.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      netFormatted: formatCents(item.netCents),
      taxRateLabel: taxRateLabel(item.taxRateBp),
      grossFormatted: formatCents(item.grossCents),
    })),
    totals: {
      netFormatted: formatCents(order.subtotalCents),
      taxFormatted: formatCents(order.taxCents),
      grossFormatted: formatCents(order.totalCents),
      taxRateLabel: taxRateLabel(taxRateBp),
    },
    paymentNote:
      order.status === "PROCESSING"
        ? "Der Betrag wird per SEPA-Lastschrift eingezogen."
        : "Der Betrag wurde bereits bezahlt.",
  };

  return createInvoiceWithNumber(
    {
      organisationId: order.organisationId,
      legalEntityId: issuer.id,
      invoicePrefix: issuer.invoicePrefix,
      type: "INVOICE",
      orderId: order.id,
      userId: order.userId,
      issueDate,
      servicePeriodFrom,
      servicePeriodTo,
      issuerSnapshot,
      recipientSnapshot,
      lines,
      netCents: order.subtotalCents,
      taxCents: order.taxCents,
      grossCents: order.totalCents,
      taxRateBp,
      // GoBD: PDF wird mit der vergebenen Nummer innerhalb der Transaktion
      // erzeugt und abgelegt; ein Fehlschlag rollt den Zähler mit zurück.
    },
    async (invoiceNumber) => {
      const buffer = await renderToBuffer(
        InvoicePdf({ data: { ...pdfData, number: invoiceNumber } }),
      );
      const year = issueDate.getUTCFullYear();
      return storeInvoicePdf(`${issuer.id}/${year}/${invoiceNumber}.pdf`, buffer);
    },
  );
}
