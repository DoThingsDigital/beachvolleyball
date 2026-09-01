import { NextResponse } from "next/server";

import {
  getWebhookEvent,
  markWebhookEventProcessed,
  recordWebhookEvent,
} from "@/src/db/webhook-events";
import { getStripe } from "@/src/services/stripe";
import { processStripeEvent } from "@/src/services/stripe-webhooks";

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

  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    // Ungültige Signatur: kein Retry gewünscht → 400
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const record = await recordWebhookEvent({
    provider: "stripe",
    eventId: event.id,
    type: event.type,
    payload: JSON.parse(rawBody),
  });
  if (record === "duplicate") {
    // Erfolgreich verarbeitete Events sind No-ops; hängen gebliebene
    // (nie verarbeitet oder mit Fehler) werden beim Retry erneut verarbeitet.
    const stored = await getWebhookEvent("stripe", event.id);
    const needsRetry =
      !stored?.processedAt || stored.error?.startsWith("FEHLER");
    if (!needsRetry) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  try {
    const result = await processStripeEvent(event);
    await markWebhookEventProcessed("stripe", event.id, result.note);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // Fehler festhalten und 500 liefern → Stripe stellt erneut zu; der
    // nächste Versuch trifft auf "duplicate" nur beim Persistieren, die
    // Verarbeitung selbst ist idempotent.
    const message = error instanceof Error ? error.message : String(error);
    await markWebhookEventProcessed("stripe", event.id, `FEHLER: ${message}`);
    console.error("[stripe-webhook] Verarbeitung fehlgeschlagen:", error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
