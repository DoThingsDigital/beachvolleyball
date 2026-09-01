import { NextResponse } from "next/server";

import { recordWebhookEvent } from "@/src/db/webhook-events";
import { getStripe } from "@/src/services/stripe";

// Stripe-Webhook (G4): Signatur prüfen, Event idempotent persistieren.
// Die fachliche Verarbeitung (Order-/Booking-Statusübergänge) kommt mit
// Ticket 2.5 und liest aus WebhookEvent – Zustellung und Verarbeitung
// bleiben getrennt, damit Retries und Reihenfolge egal sind.

export async function POST(req: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET fehlt");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let eventId: string;
  let eventType: string;
  try {
    const event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
    eventId = event.id;
    eventType = event.type;
  } catch {
    // Ungültige Signatur: kein Retry gewünscht → 400
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const result = await recordWebhookEvent({
    provider: "stripe",
    eventId,
    type: eventType,
    payload: JSON.parse(rawBody),
  });

  return NextResponse.json({ received: true, duplicate: result === "duplicate" });
}
