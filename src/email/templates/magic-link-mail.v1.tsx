import { EmailLayout, emailStyles } from "./layout.v1";

export const MAGIC_LINK_TEMPLATE = "magic-link";
export const MAGIC_LINK_VERSION = "v1";

export function MagicLinkMail({
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
        mit dem folgenden Link meldest du dich an. Er ist 15 Minuten gültig und
        kann nur einmal verwendet werden.
      </p>
      <a href={url} style={emailStyles.button}>
        Jetzt anmelden
      </a>
      <p style={emailStyles.linkFallback}>
        Falls der Button nicht funktioniert: {url}
      </p>
    </EmailLayout>
  );
}
