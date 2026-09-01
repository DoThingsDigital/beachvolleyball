# Sprint-Backlog `dtd-booking`

Wochensprints. Aufwand in Stunden (Janick mit Claude Code; Review durch Juri kommt obendrauf). `Ref` verweist auf IDs im Lastenheft. Status wird in dieser Datei gepflegt (`[ ]` offen, `[~]` in Arbeit, `[x]` fertig).

Definition of Done (global): Code gemerged, Tests grün, Migration angewendet, in Staging verifiziert, Backlog-Status aktualisiert, ggf. `CLAUDE.md`/Docs nachgezogen.

---

## Sprint 0 · KW 36 (31.08.–06.09.) · Setup · ~18 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [~] 0.1 | Stack mit Juri festziehen, Repo anlegen, `CLAUDE.md` einchecken | 2 | §5 Rahmen | Entscheidung dokumentiert in `00_PROJEKTRAHMEN.md` §8 — Stack vorläufig fix (31.08.), Juri-Review steht aus |
| [x] 0.2 | Next.js + TypeScript strict + Tailwind + shadcn/ui, ESLint/Prettier, Vitest, Playwright | 3 | NF9 | `pnpm test` und `pnpm e2e` laufen leer durch |
| [x] 0.3 | Postgres (lokal Docker + Staging EU), Prisma, Migrations-Pipeline mit Custom-SQL-Schritt | 3 | NF6 | `prisma migrate dev` inkl. `btree_gist` |
| [x] 0.4 | Auth.js v5: Magic Link + Passwort, Session, Rollen-Middleware | 4 | A1 | Login/Logout E2E |
| [ ] 0.5 | CI (Lint, Test, Build), Staging-Deploy, Sentry, `.env.example` | 2 | NF12 | Preview-Deploy pro PR |
| [x] 0.6 | Stripe-Testaccount, Webhook-Endpunkt mit Signaturprüfung, Stripe CLI lokal | 1 | G4 | Test-Event landet in `WebhookEvent` |
| [ ] 0.7 | Hostinger-VPS: Standort DE prüfen, Ubuntu 24.04 härten (SSH-Key, ufw, fail2ban, unattended-upgrades), Coolify mit Staging + Prod, Postgres-Container, nächtlicher `pg_dump` auf externen S3, Restore-Test | 3 | NF6 | Restore aus Backup einmal erfolgreich durchgespielt |

> **Stand 0.3 (31.08.2026):** Lokal verifiziert: `pnpm db:up` + `pnpm prisma migrate dev` grün, `btree_gist` 1.7 aktiv, Exclusion-Constraint-Probe lehnt Überlappungen ab, Test-DB `dtd_booking_test` vorhanden. Container läuft auf **Port 5433** (natives PostgreSQL 16 belegt auf Janicks Rechner Port 5432). Staging-Postgres (EU) folgt mit Ticket 0.5/0.7.

## Sprint 1 · KW 37 (07.–13.09.) · Datenmodell + Konfiguration + Konto · ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 1.1 | Vollständiges Prisma-Schema nach `02_DATENMODELL.md` inkl. Enums, Indizes, Constraints (Exclusion, Unique) | 5 | B1–B5 | Migration; Test: Cross-Tenant-Query schlägt fehl |
| [x] 1.2 | Seed Winter 1 (Organisation, LegalEntities, Venue, Courts, Season, Club, Vereinskontingent-Block) | 2 | Seed | `pnpm seed` idempotent — **Preise/Rabatt sind Platzhalter** bis Kalkulationstool v2, Adressen TODO, Beach-Liga-Slots nach Abstimmung mit Roland |
| [x] 1.3 | Admin-Layout (Sidebar, Standort-Switcher, Rollen-Guard) | 3 | K3 | Nur ADMIN/STAFF sehen Admin |
| [x] 1.4 | Admin: Standort-Konfiguration (Öffnungszeiten, Schließtage, Raster, Fristen, Storno-Regel) | 4 | B2 | Formular mit Zod-Validierung, Audit-Eintrag |
| [x] 1.5 | Admin: Plätze, Saisons, Vereine, Aussteller (LegalEntity) CRUD | 4 | B3–B5 | Aussteller-Wechsel am Standort möglich |
| [x] 1.6 | Admin: Preisregeln CRUD mit Vorschau „Preis für Slot X" | 3 | C1, C2 | – |
| [x] 1.7 | `computePrice()` + Dauerplatz-Kalkulation als reine Funktionen, Unit-Tests (Überlappung, Wochenende, Mitglied, Rabatt, Rundung, Zeitumstellung 25.10.) | 4 | C3, NF2 | ≥ 15 Testfälle — 24 Tests in `src/domain/pricing.test.ts` |
| [x] 1.8 | Kundenkonto: Registrierung (Double-Opt-in), Profil, Rechnungsadresse, AGB-Zustimmung mit Version | 4 | A1–A3 | E2E Registrierung |
| [x] 1.9 | E-Mail-Provider (EU), React-Email-Templates: Verifizierung, Magic Link, Basis-Layout; `EmailLog` | 1 | J1 | Resend angebunden; EU-Region bei Domain-Verifizierung wählen (Go-Live-Checkliste) |

## Sprint 2 · KW 38 (14.–20.09.) · Dauerplatz-Shop + Checkout · ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 2.1 | Verfügbarkeitslogik Dauerplatz: freie Kombinationen (Court, Wochentag, Startzeit, Dauer) über die Saison unter Berücksichtigung von Blocks und bestehenden Subscriptions | 5 | F1, D4 | Unit-Tests; Performance < 300 ms |
| [x] 2.2 | Vorverkaufs-UI: Raster Wochentag × Zeitfenster, Auswahl Dauer/Platzgruppe, Preisanzeige mit Terminanzahl | 6 | F2 | Mobile 375 px ohne horizontales Scrollen |
| [x] 2.3 | Order/OrderItem anlegen, Subscription `PENDING` + Bookings `HOLD` materialisieren, Hold-Ablauf per Cron | 4 | G1, D3 | Hold-Cleanup-Job idempotent |
| [x] 2.4 | Stripe Checkout Session (SEPA, Karte; PayPal per Flag), Stripe-Customer pro User, `setup_future_usage` | 4 | G2 | Testkauf mit SEPA-Testkonto |
| [x] 2.5 | Webhooks: `checkout.session.completed`, `payment_intent.processing/succeeded/payment_failed`, `charge.refunded`, `charge.dispute.created`; Idempotenz; Order-/Booking-Statusübergänge; `SepaMandate` speichern | 6 | G3–G5 | Tests mit Stripe-Fixture-Events in beliebiger Reihenfolge |
| [x] 2.6 | Bestellbestätigung + Zahlung-fehlgeschlagen-Mails; „Meine Dauerplätze" im Konto | 3 | J1 | – |
| [x] 2.7 | Verfügbarkeit im Webhook erneut prüfen, Konfliktfall → Auto-Refund + Mail | 2 | G6 | Test: Hold abgelaufen, Session bezahlt |

## Sprint 3 · KW 39 (21.–27.09.) · Rechnungen + Backoffice + Go-Live Stufe 1 · ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 3.1 | Rechnungsmodul: Nummernkreis (transaktional), Snapshots, PDF (`@react-pdf/renderer`), Storage-Upload, SHA-256 | 7 | H1, H2, H5 | Test: 50 parallele Rechnungen ohne Lücke/Dublette |
| [x] 3.2 | Rechnung bei `PAID`/`PROCESSING` automatisch, Mailversand mit Anhang, Download im Konto | 2 | H4 | – |
| [x] 3.3 | Gutschrift/Stornorechnung, Admin-Erstattung über Stripe (ganz/teilweise), Refund-Webhook | 5 | H3, I1 | Teilerstattung erzeugt Teilgutschrift |
| [x] 3.4 | Admin: Bestellungen (Liste, Filter, Detail, Rechnung neu senden) | 3 | K1 | – |
| [x] 3.5 | Admin: Kunden (Liste, Suche, Detail mit Bestellungen/Mandaten/Notizen), Dauerplatz kündigen mit anteiliger Erstattung | 4 | K2, F4 | – |
| [~] 3.6 | Rechtstexte-Seiten (AGB, Datenschutz, Impressum, Widerrufshinweis) als versionierte Inhalte; Checkout-Checkbox | 2 | A3 | Infrastruktur fertig (/recht/*, Footer, Checkout-Checkbox, Zustimmung mit Version) — **wartet auf finale Texte vom Anwalt** |
| [x] 3.7 | E2E: Registrierung → Dauerplatz kaufen (SEPA) → Rechnung erhalten; Fehlerfall Zahlung | 3 | NF9 | Läuft in CI |
| [ ] 3.8 | Go-Live-Checkliste Stufe 1 (unten), Backup-Restore-Test, Stripe Live-Keys erst nach Aussteller-Entscheidung | 4 | NF6 | Checkliste abgehakt |

**Stufe 1 live: Fr 02.10.2026.** KW 40 ist Puffer und Vorverkaufsstart.

## Sprint 4 · KW 40–41 (28.09.–11.10.) · Kalender + Einzelbuchung · ~40 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 4.1 | Verfügbarkeits-API für Wochenansicht (Courts × Slots, Zustände), Caching pro Woche/Standort | 5 | D1 | < 1 s für eine Woche |
| [x] 4.2 | Öffentlicher Kalender (Woche/Tag, mobil), Preisvorschau, Auswahl mit Dauer | 8 | D1, D2, C4 | Tastaturbedienbar |
| [x] 4.3 | Hold → Checkout für Einzelbuchung (Wiederverwendung Sprint 2), `sepaLeadDays`-Regel für Zahlarten | 5 | D3, D7 | – |
| [x] 4.4 | Buchungsbestätigung mit ICS, „Meine Buchungen", Kunden-Storno mit Frist, Erstattung/Guthaben je Regel | 6 | D5, D6, I2 | – |
| [x] 4.5 | Konfliktschutz-Test: 20 parallele Buchungen auf denselben Slot, genau eine gewinnt | 2 | D4 | – |
| [x] 4.6 | Mitgliedschaftsanfrage im Konto, Vereins-Admin-Freigabe, Mitgliederliste-Import (CSV E-Mails), Mitgliederpreis im Checkout | 6 | A4 | – |
| [x] 4.7 | Prüfen: Stripe Payment Element (eingebettet) statt Hosted Checkout für Einzelbuchung, wegen Hold-Dauer 15 min vs. Session-Mindestlaufzeit | 4 | G2 | Entscheidung dokumentiert (docs/04_ENTSCHEIDUNGEN.md E-003: Hosted Checkout bleibt) |
| [x] 4.8 | Erinnerungs-Mail 24 h vorher (Cron), Storno-Mail | 4 | J2 | – |

## Sprint 5 · KW 42–43 (12.–25.10.) · Sperren, Kontingent, Admin-Kalender · ~35 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 5.1 | Block-CRUD mit RRULE, Materialisierung in Bookings (Saisonhorizont), Re-Materialisierung bei Änderung ohne Verlust bestätigter Termine | 6 | E1, E2 | Tests |
| [x] 5.2 | Kontingent-Freigabe-Cron (`RELEASED`), Weiterverkauf als `RELEASE_RESALE` | 3 | E3 | – |
| [x] 5.3 | Vereins-Admin-Bereich: Kontingent bestätigen/freigeben, Trainingsgruppe beschriften | 4 | E4 | – |
| [x] 5.4 | Admin-Kalender: Wochenansicht je Platz, manuelle Belegung (mit/ohne Rechnung, manuelle Zahlart), Sperre, Verschieben, Stornieren, No-Show | 12 | K4, G7, I4 | Drag & Drop optional (nicht umgesetzt) |
| [ ] 5.5 | Dauerplatz-Übersicht Saison (Raster), Konflikte, Kündigung aus dem Kalender | 4 | K5 | – |
| [ ] 5.6 | Betreiber-Massenstorno für Zeitraum (Hallenausfall) mit Guthaben/Erstattung + Sammelmail | 4 | I3 | – |
| [ ] 5.7 | Audit-Log-Ansicht | 2 | K6 | – |

## Sprint 6 · KW 44 (26.10.–01.11.) · Reports + Go-Live Stufe 2 · ~25 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [ ] 6.1 | Report Auslastung (Tag/Woche/Zeitfenster/Platz) mit CSV | 5 | L1 | – |
| [ ] 6.2 | Report Umsatz (Zeitraum, Produktart, Zahlart, Erstattungen) mit CSV | 4 | L2 | Summen stimmen mit Stripe-Auszahlungen überein |
| [ ] 6.3 | **Report Vereinsnutzung** mit vier Quoten, Definitionstext, CSV + PDF | 6 | L3 | Sportamt-tauglicher Export |
| [ ] 6.4 | Report Dauerplatz-Quote | 2 | L4 | – |
| [ ] 6.5 | Datenauskunft/Anonymisierung im Admin | 3 | A5 | Rechnungen bleiben erhalten |
| [ ] 6.6 | Go-Live-Checkliste Stufe 2, Lasttest Kalender, Uptime-Alarme | 5 | NF12 | – |

**Stufe 2 live: vor Hallenöffnung** (nach aktuellem Stand KW 44, nachziehen falls Öffnung später).

## Sprint 7+ · Winter 1 laufend · Stufe 3 (Auswahl nach Bedarf)

| Ticket | h | Ref |
|---|---|---|
| Guthabenkonto + Verrechnung im Checkout | 8 | M1 |
| 10er-Karte (Minutenkontingent) | 10 | M2 |
| Gutscheine inkl. Widerrufsbelehrung | 10 | M3 |
| Warteliste + Benachrichtigung | 10 | D8, N1 |
| Kontingent-Selbstbuchung für Vereinsmitglieder | 12 | E5 |
| Bank-SEPA: Gläubiger-ID, Mandat, Pre-Notification, pain.008-Export, Rücklastschrift-Import | 25 | G8 |
| Monatliche Dauerplatz-Abbuchung | 10 | F6 |
| DATEV-Export, Rechnungsausgangsbuch | 8 | H6 |
| Türcode-Integration | 10–20 | K7 |
| Multi-Venue-Frontend, Standort-Onboarding-Assistent (für Standort 2) | 15 | P2 |
| Kohorten-Report | 5 | L5 |
| Kurse/Trainings | 25 | P1 |

---

## Go-Live-Checkliste Stufe 1

- [ ] Rechtsträger entschieden (02.09.), aktiver `LegalEntity` gesetzt, Steuersatz vom Steuerberater bestätigt
- [ ] Stripe Live-Account des Zahlungsempfängers verifiziert, SEPA-Lastschrift aktiviert, Webhook-Secret Live
- [ ] AGB, Datenschutz, Impressum, Widerrufshinweis final und versioniert
- [ ] AV-Verträge: Stripe, E-Mail-Provider, Hoster, Object Storage
- [ ] Preisregeln und Dauerplatz-Rabatt Winter 1 eingetragen und gegen Kalkulationstool geprüft
- [ ] Testkauf Live mit 1 € Produkt, Rechnung geprüft (Pflichtangaben, Nummer, PDF-Hash), Erstattung getestet
- [ ] Backup läuft täglich, Restore einmal durchgespielt
- [ ] Sentry und Uptime-Alarm aktiv, Fehler-Mail an Janick
- [ ] Domain, TLS, E-Mail-Domain (SPF/DKIM/DMARC) eingerichtet
- [ ] Roland/Verein informiert, Vorverkaufs-Kommunikation vorbereitet

## Go-Live-Checkliste Stufe 2

- [ ] Vereinskontingent und Beach-Liga-Slots als Blocks eingetragen und mit Roland abgestimmt
- [ ] Öffnungszeiten, Schließtage (Weihnachten, Silvester), Zeitumstellung 25.10. geprüft
- [ ] Storno-Regel, Mindestvorlauf, Horizont, `sepaLeadDays` gesetzt
- [ ] Erinnerungs-Cron, Hold-Cleanup, Freigabe-Cron laufen in Produktion (Monitoring)
- [ ] Staff-Accounts angelegt, Admin-Kalender-Schulung (15 min)
- [ ] Vereinsnutzungs-Report einmal mit Testdaten an Sportamt-Anforderung gespiegelt
