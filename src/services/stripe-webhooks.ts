import type Stripe from "stripe";

import { getOrganisationSettings } from "@/src/db/organisations";
import {
  cancelFulfillmentTx,
  confirmFulfillmentTx,
  findOrderByStripeRef,
  linkPaymentIntent,
  saveSepaMandate,
  setUserSepaBlocked,
  transitionOrder,
  upsertStripePayment,
} from "@/src/db/orders";
import { getStripe } from "./stripe";

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

async function handlePaymentProcessing(
  pi: Stripe.PaymentIntent,
): Promise<ProcessResult> {
  const order = await findOrderByStripeRef({
    orderId: metaOrderId(pi),
    paymentIntentId: pi.id,
  });
  if (!order) return { handled: false, note: "Order nicht gefunden" };

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
    await confirmFulfillmentTx(order.id);
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
  await confirmFulfillmentTx(order.id);
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
    case "charge.refunded":
    case "charge.dispute.created":
      // Erstattungen/Disputes verarbeitet das Rechnungsmodul (Ticket 3.3);
      // bis dahin nur protokolliert (Event liegt in WebhookEvent).
      return { handled: true, note: "aufgezeichnet, Verarbeitung ab Ticket 3.3" };
    default:
      return { handled: true, note: `ignoriert (${event.type})` };
  }
}
