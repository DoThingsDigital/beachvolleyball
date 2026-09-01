// Rechtstexte (Ticket 3.6, A3): versionierte Inhalte. Die finalen Texte
// kommen von Janick/Anwalt und ersetzen die Platzhalter; bei inhaltlichen
// Änderungen wird die Version hochgezählt (Kunden stimmen erneut zu, A3)
// und Venue.termsVersion/Organisation.settings.termsVersion nachgezogen.

export type LegalDocKey = "agb" | "datenschutz" | "impressum" | "widerruf";

export type LegalDoc = {
  key: LegalDocKey;
  title: string;
  version: string;
  updatedAt: string; // ISO-Datum der Textfassung
  /** Absätze; Überschriften mit "## " am Zeilenanfang */
  body: string;
};

const PLACEHOLDER_HINT =
  "## Hinweis\nDies ist ein Platzhaltertext. Die finale, anwaltlich geprüfte Fassung wird vor dem Vorverkaufsstart eingepflegt (Ticket 3.6).";

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  agb: {
    key: "agb",
    title: "Allgemeine Geschäftsbedingungen",
    version: "v1",
    updatedAt: "2026-09-01",
    body: `${PLACEHOLDER_HINT}\n\n## Geltungsbereich\nDiese AGB gelten für die Buchung von Beachvolleyball-Plätzen und Dauerplätzen über diese Plattform.\n\n## Vertragspartner\nVertragspartner ist der auf der jeweiligen Rechnung ausgewiesene Betreiber.\n\n## Buchung und Zahlung\nBuchungen sind verbindlich, sobald die Zahlung bestätigt wurde. Es gelten die beim Kauf angezeigten Preise.\n\n## Widerruf\nFür Buchungen mit festem Termin besteht gemäß § 312g Abs. 2 Nr. 9 BGB kein Widerrufsrecht.`,
  },
  datenschutz: {
    key: "datenschutz",
    title: "Datenschutzerklärung",
    version: "v1",
    updatedAt: "2026-09-01",
    body: `${PLACEHOLDER_HINT}\n\n## Verantwortlicher\nDer Verantwortliche im Sinne der DSGVO wird hier benannt.\n\n## Verarbeitete Daten\nKontodaten (E-Mail, Name, Telefon), Rechnungsadresse, Buchungs- und Zahlungsdaten (Zahlungsabwicklung über Stripe), E-Mail-Versand über einen Auftragsverarbeiter.\n\n## Aufbewahrung\nRechnungsdaten werden gemäß gesetzlicher Fristen 10 Jahre aufbewahrt; Konten werden auf Wunsch anonymisiert.`,
  },
  impressum: {
    key: "impressum",
    title: "Impressum",
    version: "v1",
    updatedAt: "2026-09-01",
    body: `${PLACEHOLDER_HINT}\n\n## Anbieter\nDoThingsDigital GmbH\nMusterstraße 1\n51063 Köln\n\n## Kontakt\nlets@dothingsdigital.de`,
  },
  widerruf: {
    key: "widerruf",
    title: "Widerrufshinweis",
    version: "v1",
    updatedAt: "2026-09-01",
    body: `${PLACEHOLDER_HINT}\n\n## Kein Widerrufsrecht bei termingebundenen Freizeitleistungen\nBei Verträgen zur Erbringung von Dienstleistungen im Zusammenhang mit Freizeitbetätigungen, die einen spezifischen Termin oder Zeitraum vorsehen, besteht gemäß § 312g Abs. 2 Nr. 9 BGB kein Widerrufsrecht. Platz- und Dauerplatzbuchungen fallen unter diese Ausnahme.`,
  },
};
