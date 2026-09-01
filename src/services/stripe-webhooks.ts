import type Stripe from "stripe";

import { formatCents } from "@/lib/format";
import { getOrganisationSettings } from "@/src/db/organisations";
import {
  cancelFulfillmentTx,
  confirmFulfillmentTx,
  findOrderByStripeRef,
  hasRefundForOrder,
  linkPaymentIntent,
  recordAutoRefund,
  saveSepaMandate,
  setUserSepaBlocked,
  transitionOrder,
  upsertStripePayment,
} from "@/src/db/orders";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  CHECKOUT_CONFLICT_TEMPLATE,
  CHECKOUT_CONFLICT_VERSION,
  CheckoutConflictMail,
} from "@/src/email/templates/checkout-conflict-mail.v1";
import {
  ORDER_CONFIRMATION_TEMPLATE,
  ORDER_CONFIRMATION_VERSION,
  OrderConfirmationMail,
} from "@/src/email/templates/order-confirmation-mail.v1";
import {
  INVOICE_MAIL_TEMPLATE,
  INVOICE_MAIL_VERSION,
  InvoiceMail,
} from "@/src/email/templates/invoice-mail.v1";
import {
  PAYMENT_FAILED_TEMPLATE,
  PAYMENT_FAILED_VERSION,
  PaymentFailedMail,
} from "@/src/email/templates/payment-failed-mail.v1";
import { markRefundByProviderRef } from "@/src/db/refunds";
import { createInvoiceForOrder } from "./invoices";
import { readInvoicePdf } from "./storage";
import { getStripe } from "./stripe";

type OrderWithUser = NonNullable<
  Awaited<ReturnType<typeof findOrderByStripeRef>>
>;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// Webhook-Verarbeitung (Ticket 2.5, G3–G5): idempotent und
// reihenfolge-unabhängig. Jeder Handler prüft den Ist-Zustand über
// konditionale Updates; doppelte oder verspätete Events sind No-ops.
// Gutschrift bei Fehlschlag nach PROCESSING folgt mit dem Rechnungsmodul
// (Ticket 3.3), die Kunden-Mails mit Ticket 2.6.

export type ProcessResult = {
  handled: boolean;
  note?: string;
};

function metaOrderId(obj: { metadata?: Stripe.Metadata | null }): string | null {
  return obj.metadata?.orderId ?? null;
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<ProcessResult> {
  const order = await findOrderByStripeRef({
    orderId: session.client_reference_id ?? metaOrderId(session),
    checkoutSessionId: session.id,
  });
  if (!order) return { handled: false, note: "Order nicht gefunden" };

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  if (paymentIntentId) {
    await linkPaymentIntent(order.id, paymentIntentId);
  }
  return { handled: true };
}

async function saveMandateFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  userId: string,
): Promise<void> {
  try {
    const chargeId =
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : (pi.latest_charge?.id ?? null);
    if (!chargeId) return;
    const charge = await getStripe().charges.retrieve(chargeId);
    const sepa = charge.payment_method_details?.sepa_debit;
    if (!sepa?.mandate) return;
    await saveSepaMandate({
      userId,
      mandateRef: sepa.mandate,
      ibanLast4: sepa.last4 ?? "????",
      accountHolder: charge.billing_details?.name ?? "unbekannt",
      stripePaymentMethodId:
        typeof pi.payment_method === "string" ? pi.payment_method : null,
    });
  } catch (error) {
    // Mandat ist nachgelagert; Verarbeitung nicht am Stripe-Read scheitern lassen
    console.error("[stripe-webhook] Mandat konnte nicht gespeichert werden:", error);
  }
}

// G6: Zahlung eingegangen, aber Reservierung bereits abgelaufen (Order vom
// Hold-Cleanup storniert) → Auto-Refund + Mail. Idempotent über Refund-Check.
async function handleConflictAfterExpiry(
  order: OrderWithUser,
  pi: Stripe.PaymentIntent,
): Promise<ProcessResult> {
  const method = pi.payment_method_types[0] ?? "unknown";
  await upsertStripePayment({
    orderId: order.id,
    providerRef: pi.id,
    method,
    amountCents: pi.amount,
    status: "SUCCEEDED",
    receivedAt: new Date(),
  });

  if (await hasRefundForOrder(order.id)) {
    return { handled: true, note: "Konflikt bereits erstattet" };
  }

  const refund = await getStripe().refunds.create({ payment_intent: pi.id });
  await recordAutoRefund({
    orderId: order.id,
    providerRef: pi.id,
    refundProviderRef: refund.id,
    amountCents: pi.amount,
    method,
    actorUserId: order.userId,
  });

  await sendEmail({
    to: order.user.email,
    subject: `Bestellung ${order.number}: Zahlung erstattet`,
    react: CheckoutConflictMail({
      brandName: getBrandName(),
      orderNumber: order.number,
      totalFormatted: formatCents(pi.amount),
    }),
    template: CHECKOUT_CONFLICT_TEMPLATE,
    templateVersion: CHECKOUT_CONFLICT_VERSION,
    userId: order.userId,
    refType: "order",
    refId: order.id,
  });

  return { handled: true, note: "Konflikt: auto-refund ausgelöst" };
}

// Ticket 3.2: Rechnung bei PAID/PROCESSING automatisch erzeugen (idempotent
// über das Rechnungsmodul) und mit PDF-Anhang verschicken. Genau einmal:
// nur wenn der Aufrufer die Erst-Erfüllung festgestellt hat.
async function issueAndSendInvoice(order: OrderWithUser): Promise<void> {
  const invoice = await createInvoiceForOrder(order.id);
  const pdf = await readInvoicePdf(invoice.pdfKey);
  await sendEmail({
    to: order.user.email,
    subject: `Rechnung ${invoice.number}`,
    react: InvoiceMail({
      brandName: getBrandName(),
      invoiceNumber: invoice.number,
      totalFormatted: formatCents(invoice.grossCents),
    }),
    template: INVOICE_MAIL_TEMPLATE,
    templateVersion: INVOICE_MAIL_VERSION,
    userId: order.userId,
    refType: "invoice",
    refId: invoice.id,
    attachments: [{ filename: `Rechnung-${invoice.number}.pdf`, content: pdf }],
  });
}

async function sendOrderConfirmation(order: OrderWithUser): Promise<void> {
  await sendEmail({
    to: order.user.email,
    subject: `Bestellbestätigung ${order.number}`,
    react: OrderConfirmationMail({
      brandName: getBrandName(),
      orderNumber: order.number,
      description: order.items[0]?.description ?? "Deine Buchung",
      totalFormatted: formatCents(order.totalCents),
      orderUrl: `${appUrl()}/bestellung/${order.id}`,
    }),
    template: ORDER_CONFIRMATION_TEMPLATE,
    templateVersion: ORDER_CONFIRMATION_VERSION,
    userId: order.userId,
    refType: "order",
    refId: order.id,
  });
}

async function handlePaymentProcessing(
  pi: Stripe.PaymentIntent,
): Promise<ProcessResult> {
  const order = await findOrderByStripeRef({
    orderId: metaOrderId(pi),
    paymentIntentId: pi.id,
  });
  if (!order) return { handled: false, note: "Order nicht gefunden" };
  if (order.status === "CANCELLED") {
    return handleConflictAfterExpiry(order, pi);
  }

  const method = pi.payment_method_types[0] ?? "unknown";
  await linkPaymentIntent(order.id, pi.id, method);
  await upsertStripePayment({
    orderId: order.id,
    providerRef: pi.id,
    method,
    amountCents: pi.amount,
    status: "PROCESSING",
  });

  await transitionOrder(order.id, ["AWAITING_PAYMENT"], {
    status: "PROCESSING",
  });

  // G3: SEPA gilt bei processing als bezahlt, wenn confirmOnProcessing aktiv
  const settings = await getOrganisationSettings(order.organisationId);
  if (settings.confirmOnProcessing ?? true) {
    const fulfilled = await confirmFulfillmentTx(order.id);
    if (fulfilled.activatedSubscriptions > 0) {
      await sendOrderConfirmation(order);
      await issueAndSendInvoice(order);
    }
  }
  await saveMandateFromPaymentIntent(pi, order.userId);
  return { handled: true };
}

async function handlePaymentSucceeded(
  pi: Stripe.PaymentIntent,
): Promise<ProcessResult> {
  const order = await findOrderByStripeRef({
    orderId: metaOrderId(pi),
    paymentIntentId: pi.id,
  });
  if (!order) return { handled: false, note: "Order nicht gefunden" };
  if (order.status === "CANCELLED") {
    return handleConflictAfterExpiry(order, pi);
  }

  const method = pi.payment_method_types[0] ?? "unknown";
  await linkPaymentIntent(order.id, pi.id, method);
  await upsertStripePayment({
    orderId: order.id,
    providerRef: pi.id,
    method,
    amountCents: pi.amount,
    status: "SUCCEEDED",
    receivedAt: new Date(),
  });

  await transitionOrder(order.id, ["AWAITING_PAYMENT", "PROCESSING"], {
    status: "PAID",
    paidAt: new Date(),
  });
  const fulfilled = await confirmFulfillmentTx(order.id);
  if (fulfilled.activatedSubscriptions > 0) {
    await sendOrderConfirmation(order);
    await issueAndSendInvoice(order);
  }
  await saveMandateFromPaymentIntent(pi, order.userId);
  return { handled: true };
}

async function handlePaymentFailed(
  pi: Stripe.PaymentIntent,
): Promise<ProcessResult> {
  const order = await findOrderByStripeRef({
    orderId: metaOrderId(pi),
    paymentIntentId: pi.id,
  });
  if (!order) return { handled: false, note: "Order nicht gefunden" };

  const failureCode = pi.last_payment_error?.code ?? "payment_failed";
  await upsertStripePayment({
    orderId: order.id,
    providerRef: pi.id,
    method: pi.payment_method_types[0] ?? "unknown",
    amountCents: pi.amount,
    status: "FAILED",
    failureCode,
  });

  // Fehlschlag NACH processing (SEPA-Rücklastschrift): Nutzer für SEPA sperren (G3)
  const wasProcessing = await transitionOrder(order.id, ["PROCESSING"], {
    status: "FAILED",
  });
  if (wasProcessing.count > 0) {
    await setUserSepaBlocked(order.userId);
  } else {
    await transitionOrder(order.id, ["AWAITING_PAYMENT"], {
      status: "CANCELLED",
    });
  }
  await cancelFulfillmentTx(order.id, "PAYMENT_FAILED");

  await sendEmail({
    to: order.user.email,
    subject: `Zahlung fehlgeschlagen – Bestellung ${order.number}`,
    react: PaymentFailedMail({
      brandName: getBrandName(),
      orderNumber: order.number,
      wasConfirmed: wasProcessing.count > 0,
    }),
    template: PAYMENT_FAILED_TEMPLATE,
    templateVersion: PAYMENT_FAILED_VERSION,
    userId: order.userId,
    refType: "order",
    refId: order.id,
  });
  return { handled: true };
}

export async function processStripeEvent(event: {
  type: string;
  data: { object: unknown };
}): Promise<ProcessResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
    case "payment_intent.processing":
      return handlePaymentProcessing(event.data.object as Stripe.PaymentIntent);
    case "payment_intent.succeeded":
      return handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
    case "payment_intent.payment_failed":
      return handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
    case "charge.refunded": {
      // Ticket 3.3: von uns ausgelöste Refunds als SUCCEEDED bestätigen.
      // Unbekannte Referenzen (z. B. direkt im Stripe-Dashboard erstattet)
      // bleiben nur protokolliert – Gutschrift dann manuell über das Admin.
      const charge = event.data.object as Stripe.Charge;
      const refunds = charge.refunds?.data ?? [];
      let confirmed = 0;
      for (const refund of refunds) {
        const res = await markRefundByProviderRef(refund.id, "SUCCEEDED");
        confirmed += res.count;
      }
      return {
        handled: true,
        note: `${confirmed}/${refunds.length} Refunds bestätigt`,
      };
    }
    case "charge.dispute.created":
      // Disputes: vorerst nur protokolliert (Payment DISPUTED + Prozess folgt
      // mit dem Backoffice-Ausbau).
      return { handled: true, note: "Dispute aufgezeichnet" };
    default:
      return { handled: true, note: `ignoriert (${event.type})` };
  }
}
