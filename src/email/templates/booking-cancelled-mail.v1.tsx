import { EmailLayout, emailStyles } from "./layout.v1";

export const BOOKING_CANCELLED_TEMPLATE = "booking-cancelled";
export const BOOKING_CANCELLED_VERSION = "v1";

export function BookingCancelledMail({
  brandName,
  description,
  refundText,
}: {
  brandName: string;
  description: string;
  refundText: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>deine Buchung wurde storniert:</p>
      <p style={emailStyles.text}>
        <strong>{description}</strong>
      </p>
      <p style={emailStyles.text}>{refundText}</p>
    </EmailLayout>
  );
}
