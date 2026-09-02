import { EmailLayout, emailStyles } from "./layout.v1";

export const PASSWORD_RESET_TEMPLATE = "password-reset";
export const PASSWORD_RESET_VERSION = "v1";

export function PasswordResetMail({
  brandName,
  url,
}: {
  brandName: string;
  url: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        du (oder jemand anderes) hast ein neues Passwort für dein Konto
        angefordert. Der Link ist 60 Minuten gültig:
      </p>
      <p style={emailStyles.text}>
        <a href={url} style={emailStyles.button}>
          Neues Passwort festlegen
        </a>
      </p>
      <p style={emailStyles.linkFallback}>{url}</p>
      <p style={emailStyles.text}>
        Wenn du das nicht warst, kannst du diese E-Mail ignorieren – dein
        Passwort bleibt unverändert.
      </p>
    </EmailLayout>
  );
}
