import { getCreditBalance, payOrderWithCreditTx } from "@/src/db/credit";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";

import { invalidateOccupancyCache } from "./occupancy";
import { issueAndSendInvoice, sendOrderConfirmation } from "./stripe-webhooks";

// Guthaben-Verrechnung im Checkout (Ticket M1, S3): eine offene
// Bestellung wird vollständig mit Guthaben bezahlt – gleicher Weg wie
// eine Stripe-Zahlung (Erfüllung, Bestätigungsmail, Rechnung), nur ohne
// Zahlungsdienstleister.

export { getCreditBalance };

export async function payOrderWithCredit(
  ctx: TenantContext,
  params: { orderId: string; userId: string },
): Promise<{ orderNumber: string; remainingCents: number }> {
  const result = await payOrderWithCreditTx(ctx, params);
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      throw new DomainError(
        "NOT_FOUND",
        "Bestellung nicht gefunden oder nicht mehr offen.",
      );
    }
    throw new DomainError(
      "INSUFFICIENT_CREDIT",
      "Das Guthaben reicht für diese Bestellung nicht aus.",
    );
  }

  invalidateOccupancyCache();

  // Mails wie beim Stripe-Weg; Fehler dort blockieren die Zahlung nicht.
  await sendOrderConfirmation(result.order).catch(() => {});
  await issueAndSendInvoice(result.order).catch(() => {});

  return {
    orderNumber: result.order.number,
    remainingCents: result.remainingCents,
  };
}
