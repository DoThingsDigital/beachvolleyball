# Lastenheft `dtd-booking`

Priorität: **S1** = Stufe 1 Vorverkauf · **S2** = Stufe 2 Betrieb · **S3** = Ausbau.
Jede Anforderung hat eine ID (Modulbuchstabe + Nummer). IDs bleiben stabil; Änderungen werden im Backlog referenziert.

## Rollen

| Rolle | Beschreibung |
|---|---|
| Gast | Sieht öffentlichen Kalender und Preise, kann nicht buchen |
| Kunde | Registrierter Nutzer, bucht und bezahlt |
| Vereinsmitglied | Kunde mit verifizierter Mitgliedschaft bei einem Verein des Standorts; Mitgliederpreis |
| Vereins-Admin | Verwaltet Mitgliederliste und Vereinskontingent seines Vereins |
| Staff | Betreiber-Mitarbeiter: Kalender, manuelle Buchungen, Kundenkontakt; keine Finanzfunktionen |
| Admin | Betreiber: alles inkl. Preise, Erstattungen, Reports, Konfiguration |
| Superadmin | DTD-intern, mandantenübergreifend |

Alle Rollen außer Superadmin sind auf eine `Organisation` (Mandant) bezogen.

---

## A · Konto und Identität

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| A1 | S1 | Registrierung mit E-Mail, Name, Telefon; Login per Magic Link oder Passwort | Double-Opt-in; Passwort ≥ 10 Zeichen; Rate-Limit auf Login |
| A2 | S1 | Rechnungsadresse im Profil, Pflicht vor erstem Kauf | Validierung PLZ/Land; Adresse wird in Rechnung als Snapshot übernommen |
| A3 | S1 | Zustimmung AGB und Datenschutz mit Zeitstempel und Version | Gespeichert pro Nutzer und Version; erneute Zustimmung bei Versionswechsel |
| A4 | S2 | Mitgliedschaftsanfrage bei einem Verein; Freigabe durch Vereins-Admin oder Import einer Mitgliederliste (E-Mail) | Status `PENDING/ACTIVE/EXPIRED`; Mitgliederpreis greift nur bei `ACTIVE` |
| A5 | S2 | Datenauskunft und -löschung (Anonymisierung) als Admin-Funktion | Löschung anonymisiert Kunde, Rechnungen bleiben; Buchungen bleiben mit anonymem Nutzer |
| A6 | S3 | Familienkonto / Buchen für andere Personen | – |

## B · Standort-Konfiguration

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| B1 | S1 | Organisation (Mandant) mit mehreren Standorten (`Venue`) | Jede fachliche Tabelle trägt `organisationId`; Queries sind immer mandantengefiltert |
| B2 | S1 | Standort mit Adresse, Plätzen (`Court`), Öffnungszeiten je Wochentag, Schließtagen, Slot-Raster (30 min), Min/Max-Dauer, Mindestvorlauf, Buchungshorizont, Hold-Dauer, Storno-Frist | Alles per Admin-UI editierbar, keine Hardcodes |
| B3 | S1 | Saison mit Start/Ende, Vorverkaufsstart, Status (`DRAFT/PRESALE/ACTIVE/CLOSED`) | Buchungen nur innerhalb einer Saison mit Status `PRESALE` (Dauerplatz) oder `ACTIVE` |
| B4 | S1 | Rechnungsaussteller (`LegalEntity`) mit Firmierung, Adresse, Steuernummer/USt-ID, IBAN, Gläubiger-ID, Rechnungs-Präfix, Standard-Steuersatz; pro Standort zuweisbar | Wechsel des Ausstellers wirkt nur auf neue Rechnungen |
| B5 | S1 | Vereine (`Club`) je Standort mit Name und Vereins-Admins | Für Kontingent und Mitgliedschaften |

## C · Preise

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| C1 | S1 | Preisregeln je Saison: Plätze (alle/Auswahl), Wochentage, Zeitfenster, Preis pro Stunde, optional Mitgliederpreis, Priorität | Höchste Priorität gewinnt pro 30-min-Slot; Preis = Summe der Slots |
| C2 | S1 | Dauerplatz-Rabatt (Prozent) pro Saison | Wird auf die Summe der Einzelslots angewendet, Rundung auf Cent |
| C3 | S1 | Preisberechnung ausschließlich serverseitig; Aufschlüsselung wird an der Bestellposition gespeichert | Client zeigt nur an; Unit-Tests für Regelüberlappung, Wochenende, Mitglied |
| C4 | S2 | Preisvorschau im Kalender vor Auswahl (Gast sieht Nichtmitgliederpreis) | – |
| C5 | S3 | Aktionscodes / Rabattcodes | – |

## D · Kalender und Einzelbuchung

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| D1 | S2 | Öffentlicher Wochen-/Tageskalender pro Standort: Plätze × Zeitraster, Zustände frei/belegt/gesperrt/Vereinskontingent | Mobile-first; Ladezeit < 1 s für eine Woche |
| D2 | S2 | Kunde wählt Platz, Datum, Startzeit, Dauer (60/90/120 min, konfigurierbar) | Nur innerhalb Öffnungszeiten, Mindestvorlauf, Horizont |
| D3 | S2 | Hold: Auswahl wird für `holdMinutes` (15) reserviert, dann Checkout | Hold blockiert für andere; läuft ab → Slot wieder frei; Ablauf sichtbar im UI |
| D4 | S2 | Doppelbuchung technisch ausgeschlossen | DB-Exclusion-Constraint über `(courtId, [start,end))` für aktive Belegungen; Test mit parallelen Requests |
| D5 | S2 | Bestätigung nach Zahlung: E-Mail mit ICS-Anhang, Buchung erscheint unter „Meine Buchungen" | – |
| D6 | S2 | Buchung durch Kunden stornierbar bis Storno-Frist; danach nur Kontakt zum Betreiber | Erstattung automatisch (Stripe) oder Guthaben, je Konfiguration |
| D7 | S2 | Kurzfristige Buchungen (< `sepaLeadDays`, Vorschlag 5 Tage) nur mit sofort bestätigter Zahlart (Karte/PayPal), nicht SEPA | Zahlartenauswahl wird serverseitig eingeschränkt |
| D8 | S3 | Warteliste bei belegten Slots; Benachrichtigung bei Freiwerden | – |
| D9 | S3 | Mehrere Slots in einem Warenkorb | – |

## E · Sperren und Vereinskontingent

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| E1 | S2 | Sperre (`Block`) mit Platz, Zeitraum, optional Wiederholung (RRULE), Typ `VEREIN/LIGA/WARTUNG/EVENT/GESPERRT`, Verein, Titel | Sperren werden als Belegungen materialisiert und unterliegen demselben Konfliktschutz |
| E2 | S2 | Vereinskontingent Winter 1: zwei Plätze Mo–Do abends + Beach-Liga-Slots als wiederkehrende `VEREIN`-Sperren | Aus dem Vorvertrag übernommen; Admin kann anpassen |
| E3 | S2 | Kontingent-Freigabe: `VEREIN`-Belegungen werden `releaseHoursBefore` (48 h) vor Beginn kommerziell buchbar, wenn der Verein sie nicht bestätigt hat | Freigegebene Belegung bekommt Status `RELEASED` und zählt im Report als Vorhaltung |
| E4 | S2 | Vereins-Admin sieht sein Kontingent, kann Slots bestätigen/freigeben und mit Trainingsgruppe beschriften | – |
| E5 | S3 | Vereinsmitglieder buchen selbst innerhalb des Kontingents (Kontingent als Pool) | – |

## F · Dauerplatz und Vorverkauf

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| F1 | S1 | Dauerplatz = fester Platz, Wochentag, Startzeit, Dauer über die ganze Saison (oder Teilzeitraum) | Wird als `Subscription` gespeichert und in Einzelbelegungen materialisiert; Schließtage werden ausgelassen |
| F2 | S1 | Vorverkaufs-UI: Raster Wochentag × Zeitfenster mit Anzahl freier Dauerplätze je Platzgruppe; Auswahl → Preis inkl. Rabatt → Checkout | Anzahl Termine, Gesamtpreis und Preis pro Termin sichtbar |
| F3 | S1 | Zahlung Vorkasse (gesamt) per SEPA oder Karte | Ratenzahlung ist S3 |
| F4 | S1 | Dauerplatz kann vom Admin gekündigt/gekürzt werden mit anteiliger Erstattung oder Guthaben | Restlaufzeit × Termin-Preis |
| F5 | S2 | Kunde kann einzelne Termine seines Dauerplatzes bis Storno-Frist freigeben → Guthaben oder Freigabe für kommerzielle Buchung | Konfigurierbar; Vorschlag: Freigabe erzeugt Guthaben nur, wenn der Slot weiterverkauft wird |
| F6 | S3 | Monatliche Abbuchung per SEPA (Ratenmodell) | Stripe Subscription oder eigene Terminlogik |

## G · Warenkorb, Checkout, Zahlung

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| G1 | S1 | Bestellung (`Order`) mit Positionen, Netto/USt/Brutto, Aussteller-Snapshot, Zahlart | Beträge in Integer-Cent |
| G2 | S1 | Stripe Checkout mit SEPA-Lastschrift und Karte; PayPal optional per Konfiguration | Stripe-Kunde pro Nutzer; Zahlungsmethode für Wiederverwendung speichern |
| G3 | S1 | SEPA: Bestellung bei Status `processing` als bezahlt behandeln (Buchung bestätigt), bei späterem `payment_failed` Buchung stornieren, Nutzer für SEPA sperren, Mail | Konfigurierbar `confirmOnProcessing` |
| G4 | S1 | Webhooks idempotent (`WebhookEvent` mit eindeutiger Event-ID), Reihenfolge-unabhängig | Doppelte Events sind No-ops; Tests |
| G5 | S1 | Mandatsdaten (Referenz, IBAN-Maske, Datum) am Nutzer speichern | Keine vollständige IBAN im Klartext |
| G6 | S2 | Verfügbarkeit im Webhook erneut prüfen; bei Konflikt (Hold abgelaufen, Slot vergeben) Auto-Refund + Mail | – |
| G7 | S2 | Manuelle Zahlarten für Admin: Überweisung, Bar, Guthaben | Rechnung unabhängig von Zahlart |
| G8 | S3 | Bank-SEPA: Mandat mit eigener Gläubiger-ID, Pre-Notification-Mail, pain.008-Export als Sammellastschrift, Rücklastschrift-Import | Für Dauerplätze/Abos |

## H · Rechnungen und Belege

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| H1 | S1 | Rechnung automatisch bei bezahlter Bestellung; PDF mit Pflichtangaben § 14 UStG; Nummernkreis `PREFIX-JJJJ-000001` lückenlos je Aussteller und Jahr | Nummer wird transaktional mit Row-Lock vergeben; Test auf Lücken |
| H2 | S1 | Rechnung unveränderlich: PDF im Storage, JSON-Snapshot, SHA-256, `issuedAt` | Kein Update-Pfad im Code |
| H3 | S1 | Stornorechnung/Gutschrift bei Erstattung, verweist auf Ursprungsrechnung | Teilgutschrift möglich |
| H4 | S1 | Versand per E-Mail als Anhang, Download im Kundenkonto | – |
| H5 | S1 | Leistungszeitraum auf der Rechnung (Saison bzw. Termin) | – |
| H6 | S3 | DATEV-Export (Buchungsstapel CSV) und Rechnungsausgangsbuch | – |
| H7 | S3 | XRechnung/ZUGFeRD für Firmenkunden | – |

## I · Storno und Erstattung

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| I1 | S1 | Admin erstattet Bestellung ganz/teilweise über Stripe; Gutschrift wird erzeugt | Refund-Status per Webhook |
| I2 | S2 | Storno-Regel pro Standort: Frist, Erstattungsart (Geld/Guthaben/keine) | Kunde sieht die Regel vor dem Kauf |
| I3 | S2 | Betreiber-Storno (Hallenausfall, Wetter): Massen-Storno für Zeitraum mit Guthaben oder Erstattung, Sammelmail | – |
| I4 | S2 | No-Show-Markierung durch Staff | Reporting |

## J · Benachrichtigungen

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| J1 | S1 | Mails: Registrierung, Magic Link, Bestellbestätigung, Rechnung, Zahlung fehlgeschlagen, Erstattung | Versand protokolliert (`EmailLog`), Templates versioniert |
| J2 | S2 | Buchungsbestätigung mit ICS, Storno-Bestätigung, Erinnerung 24 h vorher (Cron) | – |
| J3 | S3 | SEPA-Pre-Notification (Bank-SEPA), Wartelisten-Benachrichtigung | – |

## K · Admin und Backoffice

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| K1 | S1 | Bestellungen: Liste, Filter, Detail, Erstattung, Rechnung neu senden | – |
| K2 | S1 | Kunden: Liste, Suche, Detail (Buchungen, Bestellungen, Mandate, Mitgliedschaften), Notizen | – |
| K3 | S1 | Konfiguration: Standort, Plätze, Saison, Preisregeln, Aussteller, Vereine, Storno-Regel, Texte | – |
| K4 | S2 | Admin-Kalender: Wochenansicht je Platz, Belegung anlegen (manuell, kostenlos oder mit Rechnung), Sperre anlegen, Verschieben, Stornieren | Drag & Drop wünschenswert, nicht Pflicht |
| K5 | S2 | Dauerplatz-Übersicht: Belegungsraster der Saison, Konflikte, Kündigung | – |
| K6 | S2 | Audit-Log für Preis-, Buchungs-, Erstattungs- und Konfigurationsänderungen | Wer, was, wann, Diff |
| K7 | S3 | Türcode/Zugangssystem: Code pro Buchung, Übergabe an Türsystem | Abhängig von Hardware |

## L · Reports

| ID | Prio | Anforderung | Akzeptanzkriterien |
|---|---|---|---|
| L1 | S2 | Auslastung: gebuchte Feldstunden / verfügbare Feldstunden je Tag, Woche, Zeitfenster, Platz | Feldstunde = 1 Platz × 1 h; verfügbar = Öffnungszeit × aktive Plätze |
| L2 | S2 | Umsatz: netto/brutto je Zeitraum, Produktart, Zahlart; Erstattungen separat | Abgleich mit Stripe-Auszahlungen möglich |
| L3 | S2 | **Vereinsnutzung**: Feldstunden nach `usageType` (Verein, kommerziell, Liga, intern) in zwei Basen: **Vorhaltung** (`VEREIN` bestätigt + freigegeben) und **Auslastung** (`VEREIN` nur tatsächlich genutzt); Quote gegen (a) alle Öffnungs-Feldstunden und (b) alle belegten Feldstunden; Zeitraum frei wählbar; CSV/PDF-Export | Vier Quoten pro Zeitraum; Definition im Report abgedruckt |
| L4 | S2 | Dauerplatz-Quote: Anteil Dauerplatz an belegten Stunden | Steuerung Vorverkauf vs. Einzelbuchung |
| L5 | S3 | Kohorten: Wiederbuchungsrate, Neukunden pro Woche | Input für Standort 2 |

## M–P · Ausbau (S3)

| ID | Anforderung |
|---|---|
| M1 | Guthabenkonto in Cent; Aufladung, Verrechnung im Checkout |
| M2 | 10er-Karte als Minutenkontingent mit Ablaufdatum |
| M3 | Gutscheine (Wert, Code, Einlösung, Widerrufsbelehrung) |
| N1 | Warteliste (siehe D8) |
| O1 | Bank-SEPA (siehe G8) |
| P1 | Kurse/Trainings mit Teilnehmerlisten |
| P2 | Multi-Venue-Auswahl im Frontend, Standort-Switcher im Admin |

---

## Nicht-funktionale Anforderungen

| ID | Anforderung |
|---|---|
| NF1 | Alle Geldbeträge Integer-Cent; Steuer pro Position gerundet, Summen aus gerundeten Positionen |
| NF2 | Zeit in UTC gespeichert, `Europe/Berlin` in Logik und Anzeige; Sommer-/Winterzeit-Tests (Umstellung 25.10.2026 liegt in der Saison) |
| NF3 | Mandantenisolation: jede Query enthält `organisationId`; Integrationstest, der Cross-Tenant-Zugriff ausschließt |
| NF4 | Keine Löschung fachlicher Datensätze: Buchungen werden storniert, Nutzer anonymisiert, Rechnungen nie gelöscht |
| NF5 | Webhook-Verarbeitung idempotent und wiederholbar; Cron-Jobs idempotent (Hold-Cleanup, Erinnerungen, Kontingent-Freigabe) |
| NF6 | EU-Hosting; tägliche Backups mit Restore-Test vor Go-Live Stufe 1 |
| NF7 | Mobile-first; Kernflows (Kalender, Checkout) auf 375 px Breite ohne horizontales Scrollen |
| NF8 | Barrierearm: Tastaturbedienung im Kalender, Kontraste, Fokusreihenfolge |
| NF9 | Unit-Tests für Preisberechnung, Konfliktprüfung, Nummernkreis, Steuerrundung; E2E für Registrierung → Kauf → Rechnung |
| NF10 | Rate-Limits auf Auth, Checkout-Erstellung, Webhook-Endpunkt (Signaturprüfung) |
| NF11 | Secrets nur per Umgebungsvariablen; IBAN (Bank-SEPA, S3) verschlüsselt at rest |
| NF12 | Fehler- und Performance-Monitoring (Sentry), Uptime-Alarm auf Kalender und Checkout |
