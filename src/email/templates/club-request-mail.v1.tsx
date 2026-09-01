import { EmailLayout, emailStyles } from "./layout.v1";

export const CLUB_REQUEST_TEMPLATE = "club-request";
export const CLUB_REQUEST_VERSION = "v1";

// Benachrichtigung an den Vereins-Admin bei neuer Mitgliedschaftsanfrage
// (Rollenmodell E-005): der Verein prüft selbst, der Betreiber ist raus.

export function ClubRequestMail({
  brandName,
  clubName,
  applicantLabel,
  vereinUrl,
}: {
  brandName: string;
  clubName: string;
  applicantLabel: string;
  vereinUrl: string;
}) {
  return (
    <EmailLayout brandName={brandName}>
      <p style={emailStyles.text}>
        für <strong>{clubName}</strong> liegt eine neue
        Mitgliedschaftsanfrage vor:
      </p>
      <p style={emailStyles.text}>
        <strong>{applicantLabel}</strong>
      </p>
      <p style={emailStyles.text}>
        <a href={vereinUrl} style={emailStyles.button}>
          Anfrage prüfen
        </a>
      </p>
      <p style={emailStyles.linkFallback}>{vereinUrl}</p>
      <p style={emailStyles.text}>
        Freigegebene Mitglieder buchen bis zum Saisonende zum
        Mitgliederpreis.
      </p>
    </EmailLayout>
  );
}
