import type { EmailConfig } from "next-auth/providers";

// v1: Bis der E-Mail-Provider angebunden ist (Ticket 1.9, Resend/Postmark),
// wird der Magic Link lokal geloggt. In Produktion ohne Provider: Fehler,
// damit niemand still ohne Mails live geht.
export const sendMagicLink: EmailConfig["sendVerificationRequest"] = async ({
  identifier,
  url,
}) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Kein E-Mail-Provider konfiguriert – Magic Link kann nicht versendet werden (Ticket 1.9).",
    );
  }
  console.log(`\n[magic-link] Anmeldelink für ${identifier}:\n${url}\n`);
};
