import type { EmailConfig } from "next-auth/providers";

import { getBrandName, sendEmail } from "./send";
import {
  MAGIC_LINK_TEMPLATE,
  MAGIC_LINK_VERSION,
  MagicLinkMail,
} from "./templates/magic-link-mail.v1";

// Magic-Link-Versand (A1/J1): React-Email-Template über den zentralen
// Versand (Resend; ohne API-Key Dev-Log). Fehler werfen, damit Auth.js
// den Login abbricht statt still ohne Mail fortzufahren.
export const sendMagicLink: EmailConfig["sendVerificationRequest"] = async ({
  identifier,
  url,
}) => {
  const result = await sendEmail({
    to: identifier,
    subject: "Dein Anmeldelink",
    react: MagicLinkMail({ url, brandName: getBrandName() }),
    template: MAGIC_LINK_TEMPLATE,
    templateVersion: MAGIC_LINK_VERSION,
  });
  if (!result.ok) {
    // Dev-Komfort: Resend-Testabsender liefert nur an die eigene Adresse –
    // damit lokal mit beliebigen Adressen getestet werden kann, landet der
    // Link in der Serverkonsole. In Produktion bleibt es ein harter Fehler.
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[magic-link:dev-fallback] Link für ${identifier}:\n${url}\n`);
      return;
    }
    throw new Error("Anmeldelink konnte nicht versendet werden.");
  }
};
