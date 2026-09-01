import {
  cancelFutureSubscriptionBookings,
  cancelSubscriptionRecord,
  findSubscriptionForCancel,
} from "@/src/db/customers";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { assertSubscriptionTransition } from "@/src/domain/state-machines";
import { refundOrder } from "./refunds";

// Dauerplatz kündigen (Ticket 3.5, F4): zukünftige Termine stornieren,
// anteilige Erstattung = Summe der stornierten Termin-Preise (inkl.
// Rundungsrest), Gutschrift über den Refund-Service.

export async function cancelSubscription(
  ctx: TenantContext,
  params: {
    subscriptionId: string;
    reason: string;
    actorUserId: string;
    /** false = nur stornieren, keine Erstattung (z. B. auf Kundenwunsch) */
    withRefund?: boolean;
  },
) {
  const subscription = await findSubscriptionForCancel(
    ctx,
    params.subscriptionId,
  );
  if (!subscription) {
    throw new DomainError("NOT_FOUND", "Dauerplatz nicht gefunden.");
  }
  assertSubscriptionTransition(subscription.status, "CANCELLED");

  const { cancelledCount, refundCents } =
    await cancelFutureSubscriptionBookings(
      subscription.id,
      new Date(),
      "SUBSCRIPTION_CANCELLED",
    );
  await cancelSubscriptionRecord(subscription.id, params.reason);

  let creditNoteNumber: string | null = null;
  if (
    (params.withRefund ?? true) &&
    refundCents > 0 &&
    subscription.orderItem?.orderId
  ) {
    const refund = await refundOrder({
      orderId: subscription.orderItem.orderId,
      amountCents: refundCents,
      reason: `Dauerplatz-Kündigung: ${params.reason}`,
      actorUserId: params.actorUserId,
    });
    creditNoteNumber = refund.creditNote.number;
  }

  return { cancelledCount, refundCents, creditNoteNumber };
}
