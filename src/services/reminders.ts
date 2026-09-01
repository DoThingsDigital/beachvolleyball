import { formatDateTime } from "@/lib/format";
import { findReminderCandidates } from "@/src/db/bookings";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  BOOKING_REMINDER_TEMPLATE,
  BOOKING_REMINDER_VERSION,
  BookingReminderMail,
} from "@/src/email/templates/booking-reminder-mail.v1";

// Erinnerungs-Mail 24 h vorher (Ticket 4.8, J2). Idempotent über EmailLog
// (refType booking-reminder + Buchungs-ID); der Cron darf beliebig oft laufen.

export async function sendBookingReminders(
  now: Date = new Date(),
): Promise<{ sent: number; candidates: number }> {
  const windowFrom = now;
  const windowTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const candidates = await findReminderCandidates(windowFrom, windowTo);

  let sent = 0;
  for (const booking of candidates) {
    if (!booking.user) continue;
    const result = await sendEmail({
      to: booking.user.email,
      subject: `Erinnerung: ${booking.court.name} am ${formatDateTime(booking.startAt)}`,
      react: BookingReminderMail({
        brandName: getBrandName(),
        description: `${booking.court.name}, ${formatDateTime(booking.startAt)}`,
        location: `${booking.venue.name}, ${booking.venue.street}, ${booking.venue.zip} ${booking.venue.city}`,
      }),
      template: BOOKING_REMINDER_TEMPLATE,
      templateVersion: BOOKING_REMINDER_VERSION,
      userId: booking.user.id,
      refType: "booking-reminder",
      refId: booking.id,
    });
    if (result.ok) sent += 1;
  }
  return { sent, candidates: candidates.length };
}
