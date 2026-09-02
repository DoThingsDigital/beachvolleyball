import { EmailLayout, emailStyles } from "./layout.v1";

export const EMAIL_CHANGE_TEMPLATE = "email-change";
export const EMAIL_CHANGE_VERSION = "v1";

export function EmailChangeMail({
  brandName,
  url,
}: {
  brandName: string;
  url: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        bitte bestätige, dass dein Konto künftig diese E-Mail-Adresse nutzen
        soll. Der Link ist 60 Minuten gültig:
      </p>
      <p style={emailStyles.text}>
        <a href={url} style={emailStyles.button}>
          Neue E-Mail-Adresse bestätigen
        </a>
      </p>
      <p style={emailStyles.linkFallback}>{url}</p>
      <p style={emailStyles.text}>
        Wenn du das nicht angefordert hast, ignoriere diese E-Mail.
      </p>
    </EmailLayout>
  );
}

export const EMAIL_CHANGE_NOTICE_TEMPLATE = "email-change-notice";

export function EmailChangeNoticeMail({
  brandName,
  newEmailMasked,
}: {
  brandName: string;
  newEmailMasked: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        für dein Konto wurde ein Wechsel der E-Mail-Adresse zu{" "}
        <strong>{newEmailMasked}</strong> angefordert. Der Wechsel wird erst
        wirksam, wenn die neue Adresse bestätigt wird.
      </p>
      <p style={emailStyles.text}>
        Wenn du das nicht warst, ändere bitte umgehend dein Passwort und
        melde dich beim Betreiber.
      </p>
    </EmailLayout>
  );
}
