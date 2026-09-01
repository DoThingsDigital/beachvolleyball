import { getOrganisationSettings } from "@/src/db/organisations";
import {
  findEarliestBookingStart,
  setStripeCheckoutSession,
} from "@/src/db/orders";
import { createRepositories } from "@/src/db/repositories";
import { findStripeCustomer, setStripeCustomerId } from "@/src/db/users";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { getStripe } from "./stripe";

// Stripe Checkout (Ticket 2.4, G2): Hosted Checkout mit SEPA + Karte
// (PayPal per Organisations-Flag), Stripe-Customer je User,
// setup_future_usage für spätere Abbuchungen (Dauerplatz-Raten, S3).

export async function startStripeCheckout(
  ctx: TenantContext,
  params: { orderId: string; userId: string; baseUrl: string },
): Promise<{ url: string }> {
  const repos = createRepositories(ctx);
  const order = await repos.orders.findForUser(params.orderId, params.userId);
  if (!order) throw new DomainError("NOT_FOUND", "Bestellung nicht gefunden.");
  if (order.status !== "AWAITING_PAYMENT") {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Diese Bestellung kann nicht mehr bezahlt werden.",
    );
  }

  const stripe = getStripe();

  // Stripe-Customer je User (G2)
  const user = await findStripeCustomer(params.userId);
  if (!user) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await setStripeCustomerId(user.id, customerId);
  }

  const settings = await getOrganisationSettings(ctx.organisationId);
  const paymentMethodTypes: ("card" | "sepa_debit" | "paypal")[] = ["card"];

  // D7: SEPA nur, wenn genug Vorlauf bis zum ersten Termin bleibt –
  // sonst käme die Rücklastschrift erst nach dem Spieltermin.
  const venue = await repos.venues.findById(order.venueId);
  const earliestStart = await findEarliestBookingStart(order.id);
  const sepaLeadMs = (venue?.sepaLeadDays ?? 5) * 24 * 60 * 60 * 1000;
  const sepaAllowed =
    !earliestStart || earliestStart.getTime() >= Date.now() + sepaLeadMs;
  if (sepaAllowed) paymentMethodTypes.push("sepa_debit");
  if (settings.paypalEnabled) paymentMethodTypes.push("paypal");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    payment_method_types: paymentMethodTypes,
    line_items: order.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: item.grossCents,
        product_data: { name: item.description },
      },
    })),
    payment_intent_data: {
      // Zahlungsmethode für Wiederverwendung speichern (G2/G8)
      setup_future_usage: "off_session",
      metadata: { orderId: order.id },
    },
    client_reference_id: order.id,
    metadata: { orderId: order.id },
    // Stripe-Minimum 30 min; Hold (15 min) läuft früher ab – der Webhook
    // prüft die Verfügbarkeit deshalb erneut (Ticket 2.7).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${params.baseUrl}/bestellung/${order.id}?checkout=erfolg`,
    cancel_url: `${params.baseUrl}/bestellung/${order.id}?checkout=abgebrochen`,
  });

  if (!session.url) {
    throw new Error("Stripe hat keine Checkout-URL geliefert.");
  }

  // Session an der Order vermerken (kein Statuswechsel: bleibt AWAITING_PAYMENT)
  await setStripeCheckoutSession(ctx, order.id, session.id);

  return { url: session.url };
}
