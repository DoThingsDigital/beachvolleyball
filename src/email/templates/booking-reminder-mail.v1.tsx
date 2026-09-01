import { EmailLayout, emailStyles } from "./layout.v1";

export const BOOKING_REMINDER_TEMPLATE = "booking-reminder";
export const BOOKING_REMINDER_VERSION = "v1";

export function BookingReminderMail({
  brandName,
  description,
  location,
}: {
  brandName: string;
  description: string;
  location: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>kurze Erinnerung an deinen Termin morgen:</p>
      <p style={emailStyles.text}>
        <strong>{description}</strong>
        <br />
        {location}
      </p>
      <p style={emailStyles.text}>Wir freuen uns auf dich!</p>
    </EmailLayout>
  );
}
