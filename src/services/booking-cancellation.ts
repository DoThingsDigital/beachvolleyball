import { formatCents, formatDateTime } from "@/lib/format";
import {
  cancelBookingRecord,
  createCreditEntry,
  findBookingForCustomerCancel,
} from "@/src/db/bookings";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  BOOKING_CANCELLED_TEMPLATE,
  BOOKING_CANCELLED_VERSION,
  BookingCancelledMail,
} from "@/src/email/templates/booking-cancelled-mail.v1";
import { invalidateOccupancyCache } from "./occupancy";
import { refundOrder } from "./refunds";

// Kunden-Storno (Ticket 4.4, D6/I2): bis zur Frist (Venue.cancelHours)
// erlaubt; Erstattungsart je Venue.cancelRefundMode:
//   MONEY  → Stripe-Erstattung + Gutschrift (über refundOrder)
//   CREDIT → Guthaben im CreditLedger (Verrechnung im Checkout ist S3)
//   NONE   → nur Stornierung

export type CustomerCancelResult = {
  refundMode: "MONEY" | "CREDIT" | "NONE";
  amountCents: number;
  creditNoteNumber: string | null;
};

export async function cancelBookingByCustomer(
  ctx: TenantContext,
  params: { bookingId: string; userId: string },
): Promise<CustomerCancelResult> {
  const booking = await findBookingForCustomerCancel(
    ctx,
    params.bookingId,
    params.userId,
  );
  if (!booking) throw new DomainError("NOT_FOUND", "Buchung nicht gefunden.");
  if (booking.kind !== "CUSTOMER") {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Dauerplatz-Termine können aktuell nur über den Betreiber storniert werden.",
    );
  }
  if (booking.status !== "CONFIRMED") {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Nur bestätigte Buchungen können storniert werden.",
    );
  }

  const deadlineMs = booking.venue.cancelHours * 60 * 60 * 1000;
  if (booking.startAt.getTime() - Date.now() < deadlineMs) {
    throw new DomainError(
      "CANCEL_DEADLINE_PASSED",
      `Die Stornofrist (${booking.venue.cancelHours} Stunden vor Beginn) ist abgelaufen. Bitte wende dich an den Betreiber.`,
    );
  }

  const cancelled = await cancelBookingRecord(
    booking.id,
    params.userId,
    "CUSTOMER_CANCELLED",
  );
  if (!cancelled) {
    throw new DomainError("INVALID_TRANSITION", "Buchung wurde bereits storniert.");
  }
  invalidateOccupancyCache();

  const amountCents = booking.priceCents ?? 0;
  const mode = booking.venue.cancelRefundMode;
  let creditNoteNumber: string | null = null;
  let refundText = "Für diese Buchung ist keine Erstattung vorgesehen.";

  const orderId = booking.orderItem?.orderId;
  const orderStatus = booking.orderItem?.order.status;

  if (mode === "MONEY" && amountCents > 0 && orderId) {
    if (orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED") {
      const refund = await refundOrder({
        orderId,
        amountCents,
        reason: "Kunden-Storno innerhalb der Frist",
        actorUserId: params.userId,
      });
      creditNoteNumber = refund.creditNote.number;
      refundText = `Wir erstatten ${formatCents(amountCents)} auf dein Zahlungsmittel (Gutschrift ${creditNoteNumber}).`;
    } else {
      refundText =
        "Die Zahlung war noch nicht abgeschlossen – es wird nichts abgebucht.";
    }
  } else if (mode === "CREDIT" && amountCents > 0) {
    await createCreditEntry(ctx, {
      userId: params.userId,
      deltaCents: amountCents,
      reason: "Kunden-Storno innerhalb der Frist",
      refType: "booking",
      refId: booking.id,
    });
    refundText = `Du erhältst ${formatCents(amountCents)} als Guthaben für deine nächste Buchung.`;
  }

  await sendEmail({
    to: booking.user!.email,
    subject: "Stornobestätigung",
    react: BookingCancelledMail({
      brandName: getBrandName(),
      description: `${booking.court.name}, ${formatDateTime(booking.startAt)}`,
      refundText,
    }),
    template: BOOKING_CANCELLED_TEMPLATE,
    templateVersion: BOOKING_CANCELLED_VERSION,
    userId: params.userId,
    refType: "booking",
    refId: booking.id,
  });

  return { refundMode: mode, amountCents, creditNoteNumber };
}
