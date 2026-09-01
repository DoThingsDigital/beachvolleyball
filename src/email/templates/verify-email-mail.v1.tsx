import { EmailLayout, emailStyles } from "./layout.v1";

export const VERIFY_EMAIL_TEMPLATE = "verify-email";
export const VERIFY_EMAIL_VERSION = "v1";

// Double-Opt-in bei der Registrierung (A1, Ticket 1.8)
export function VerifyEmailMail({
  url,
  brandName,
}: {
  url: string;
  brandName: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>Hallo,</p>
      <p style={emailStyles.text}>
        bitte bestätige deine E-Mail-Adresse, um die Registrierung
        abzuschließen. Der Link ist 15 Minuten gültig.
      </p>
      <a href={url} style={emailStyles.button}>
        E-Mail-Adresse bestätigen
      </a>
      <p style={emailStyles.linkFallback}>
        Falls der Button nicht funktioniert: {url}
      </p>
    </EmailLayout>
  );
}
