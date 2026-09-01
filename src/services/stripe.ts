import Stripe from "stripe";

// Stripe-Client-Singleton (Serverseite). API-Version pinnen wir bewusst auf
// den SDK-Default; Checkout/Webhooks bauen darauf auf (Tickets 2.4/2.5).
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY ist nicht gesetzt.");
    }
    client = new Stripe(key);
  }
  return client;
}
