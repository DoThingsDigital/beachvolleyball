# Sprint-Backlog `dtd-booking`

Wochensprints. Aufwand in Stunden (Janick mit Claude Code; Review durch Juri kommt obendrauf). `Ref` verweist auf IDs im Lastenheft. Status wird in dieser Datei gepflegt (`[ ]` offen, `[~]` in Arbeit, `[x]` fertig).

Definition of Done (global): Code gemerged, Tests grÃ¼n, Migration angewendet, in Staging verifiziert, Backlog-Status aktualisiert, ggf. `CLAUDE.md`/Docs nachgezogen.

---

## Sprint 0 Â· KW 36 (31.08.â€“06.09.) Â· Setup Â· ~18 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [~] 0.1 | Stack mit Juri festziehen, Repo anlegen, `CLAUDE.md` einchecken | 2 | Â§5 Rahmen | Entscheidung dokumentiert in `00_PROJEKTRAHMEN.md` Â§8 â€” Stack vorlÃ¤ufig fix (31.08.), Juri-Review steht aus |
| [x] 0.2 | Next.js + TypeScript strict + Tailwind + shadcn/ui, ESLint/Prettier, Vitest, Playwright | 3 | NF9 | `pnpm test` und `pnpm e2e` laufen leer durch |
| [x] 0.3 | Postgres (lokal Docker + Staging EU), Prisma, Migrations-Pipeline mit Custom-SQL-Schritt | 3 | NF6 | `prisma migrate dev` inkl. `btree_gist` |
| [x] 0.4 | Auth.js v5: Magic Link + Passwort, Session, Rollen-Middleware | 4 | A1 | Login/Logout E2E |
| [ ] 0.5 | CI (Lint, Test, Build), Staging-Deploy, Sentry, `.env.example` | 2 | NF12 | Preview-Deploy pro PR |
| [x] 0.6 | Stripe-Testaccount, Webhook-Endpunkt mit SignaturprÃ¼fung, Stripe CLI lokal | 1 | G4 | Test-Event landet in `WebhookEvent` |
| [ ] 0.7 | Hostinger-VPS: Standort DE prÃ¼fen, Ubuntu 24.04 hÃ¤rten (SSH-Key, ufw, fail2ban, unattended-upgrades), Coolify mit Staging + Prod, Postgres-Container, nÃ¤chtlicher `pg_dump` auf externen S3, Restore-Test | 3 | NF6 | Restore aus Backup einmal erfolgreich durchgespielt |

> **Stand 0.3 (31.08.2026):** Lokal verifiziert: `pnpm db:up` + `pnpm prisma migrate dev` grÃ¼n, `btree_gist` 1.7 aktiv, Exclusion-Constraint-Probe lehnt Ãœberlappungen ab, Test-DB `dtd_booking_test` vorhanden. Container lÃ¤uft auf **Port 5433** (natives PostgreSQL 16 belegt auf Janicks Rechner Port 5432). Staging-Postgres (EU) folgt mit Ticket 0.5/0.7.

## Sprint 1 Â· KW 37 (07.â€“13.09.) Â· Datenmodell + Konfiguration + Konto Â· ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 1.1 | VollstÃ¤ndiges Prisma-Schema nach `02_DATENMODELL.md` inkl. Enums, Indizes, Constraints (Exclusion, Unique) | 5 | B1â€“B5 | Migration; Test: Cross-Tenant-Query schlÃ¤gt fehl |
| [x] 1.2 | Seed Winter 1 (Organisation, LegalEntities, Venue, Courts, Season, Club, Vereinskontingent-Block) | 2 | Seed | `pnpm seed` idempotent â€” **Preise/Rabatt sind Platzhalter** bis Kalkulationstool v2, Adressen TODO, Beach-Liga-Slots nach Abstimmung mit Roland |
| [x] 1.3 | Admin-Layout (Sidebar, Standort-Switcher, Rollen-Guard) | 3 | K3 | Nur ADMIN/STAFF sehen Admin |
| [x] 1.4 | Admin: Standort-Konfiguration (Ã–ffnungszeiten, SchlieÃŸtage, Raster, Fristen, Storno-Regel) | 4 | B2 | Formular mit Zod-Validierung, Audit-Eintrag |
| [x] 1.5 | Admin: PlÃ¤tze, Saisons, Vereine, Aussteller (LegalEntity) CRUD | 4 | B3â€“B5 | Aussteller-Wechsel am Standort mÃ¶glich |
| [x] 1.6 | Admin: Preisregeln CRUD mit Vorschau â€žPreis fÃ¼r Slot X" | 3 | C1, C2 | â€“ |
| [x] 1.7 | `computePrice()` + Dauerplatz-Kalkulation als reine Funktionen, Unit-Tests (Ãœberlappung, Wochenende, Mitglied, Rabatt, Rundung, Zeitumstellung 25.10.) | 4 | C3, NF2 | â‰¥ 15 TestfÃ¤lle â€” 24 Tests in `src/domain/pricing.test.ts` |
| [x] 1.8 | Kundenkonto: Registrierung (Double-Opt-in), Profil, Rechnungsadresse, AGB-Zustimmung mit Version | 4 | A1â€“A3 | E2E Registrierung |
| [x] 1.9 | E-Mail-Provider (EU), React-Email-Templates: Verifizierung, Magic Link, Basis-Layout; `EmailLog` | 1 | J1 | Resend angebunden; EU-Region bei Domain-Verifizierung wÃ¤hlen (Go-Live-Checkliste) |

## Sprint 2 Â· KW 38 (14.â€“20.09.) Â· Dauerplatz-Shop + Checkout Â· ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [x] 2.1 | VerfÃ¼gbarkeitslogik Dauerplatz: freie Kombinationen (Court, Wochentag, Startzeit, Dauer) Ã¼ber die Saison unter BerÃ¼cksichtigung von Blocks und bestehenden Subscriptions | 5 | F1, D4 | Unit-Tests; Performance < 300 ms |
| [x] 2.2 | Vorverkaufs-UI: Raster Wochentag Ã— Zeitfenster, Auswahl Dauer/Platzgruppe, Preisanzeige mit Terminanzahl | 6 | F2 | Mobile 375 px ohne horizontales Scrollen |
| [x] 2.3 | Order/OrderItem anlegen, Subscription `PENDING` + Bookings `HOLD` materialisieren, Hold-Ablauf per Cron | 4 | G1, D3 | Hold-Cleanup-Job idempotent |
| [x] 2.4 | Stripe Checkout Session (SEPA, Karte; PayPal per Flag), Stripe-Customer pro User, `setup_future_usage` | 4 | G2 | Testkauf mit SEPA-Testkonto |
| [x] 2.5 | Webhooks: `checkout.session.completed`, `payment_intent.processing/succeeded/payment_failed`, `charge.refunded`, `charge.dispute.created`; Idempotenz; Order-/Booking-StatusÃ¼bergÃ¤nge; `SepaMandate` speichern | 6 | G3â€“G5 | Tests mit Stripe-Fixture-Events in beliebiger Reihenfolge |
| [ ] 2.6 | BestellbestÃ¤tigung + Zahlung-fehlgeschlagen-Mails; â€žMeine DauerplÃ¤tze" im Konto | 3 | J1 | â€“ |
| [ ] 2.7 | VerfÃ¼gbarkeit im Webhook erneut prÃ¼fen, Konfliktfall â†’ Auto-Refund + Mail | 2 | G6 | Test: Hold abgelaufen, Session bezahlt |

## Sprint 3 Â· KW 39 (21.â€“27.09.) Â· Rechnungen + Backoffice + Go-Live Stufe 1 Â· ~30 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [ ] 3.1 | Rechnungsmodul: Nummernkreis (transaktional), Snapshots, PDF (`@react-pdf/renderer`), Storage-Upload, SHA-256 | 7 | H1, H2, H5 | Test: 50 parallele Rechnungen ohne LÃ¼cke/Dublette |
| [ ] 3.2 | Rechnung bei `PAID`/`PROCESSING` automatisch, Mailversand mit Anhang, Download im Konto | 2 | H4 | â€“ |
| [ ] 3.3 | Gutschrift/Stornorechnung, Admin-Erstattung Ã¼ber Stripe (ganz/teilweise), Refund-Webhook | 5 | H3, I1 | Teilerstattung erzeugt Teilgutschrift |
| [ ] 3.4 | Admin: Bestellungen (Liste, Filter, Detail, Rechnung neu senden) | 3 | K1 | â€“ |
| [ ] 3.5 | Admin: Kunden (Liste, Suche, Detail mit Bestellungen/Mandaten/Notizen), Dauerplatz kÃ¼ndigen mit anteiliger Erstattung | 4 | K2, F4 | â€“ |
| [ ] 3.6 | Rechtstexte-Seiten (AGB, Datenschutz, Impressum, Widerrufshinweis) als versionierte Inhalte; Checkout-Checkbox | 2 | A3 | Texte kommen von Janick/Anwalt |
| [ ] 3.7 | E2E: Registrierung â†’ Dauerplatz kaufen (SEPA) â†’ Rechnung erhalten; Fehlerfall Zahlung | 3 | NF9 | LÃ¤uft in CI |
| [ ] 3.8 | Go-Live-Checkliste Stufe 1 (unten), Backup-Restore-Test, Stripe Live-Keys erst nach Aussteller-Entscheidung | 4 | NF6 | Checkliste abgehakt |

**Stufe 1 live: Fr 02.10.2026.** KW 40 ist Puffer und Vorverkaufsstart.

## Sprint 4 Â· KW 40â€“41 (28.09.â€“11.10.) Â· Kalender + Einzelbuchung Â· ~40 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [ ] 4.1 | VerfÃ¼gbarkeits-API fÃ¼r Wochenansicht (Courts Ã— Slots, ZustÃ¤nde), Caching pro Woche/Standort | 5 | D1 | < 1 s fÃ¼r eine Woche |
| [ ] 4.2 | Ã–ffentlicher Kalender (Woche/Tag, mobil), Preisvorschau, Auswahl mit Dauer | 8 | D1, D2, C4 | Tastaturbedienbar |
| [ ] 4.3 | Hold â†’ Checkout fÃ¼r Einzelbuchung (Wiederverwendung Sprint 2), `sepaLeadDays`-Regel fÃ¼r Zahlarten | 5 | D3, D7 | â€“ |
| [ ] 4.4 | BuchungsbestÃ¤tigung mit ICS, â€žMeine Buchungen", Kunden-Storno mit Frist, Erstattung/Guthaben je Regel | 6 | D5, D6, I2 | â€“ |
| [ ] 4.5 | Konfliktschutz-Test: 20 parallele Buchungen auf denselben Slot, genau eine gewinnt | 2 | D4 | â€“ |
| [ ] 4.6 | Mitgliedschaftsanfrage im Konto, Vereins-Admin-Freigabe, Mitgliederliste-Import (CSV E-Mails), Mitgliederpreis im Checkout | 6 | A4 | â€“ |
| [ ] 4.7 | PrÃ¼fen: Stripe Payment Element (eingebettet) statt Hosted Checkout fÃ¼r Einzelbuchung, wegen Hold-Dauer 15 min vs. Session-Mindestlaufzeit | 4 | G2 | Entscheidung dokumentiert |
| [ ] 4.8 | Erinnerungs-Mail 24 h vorher (Cron), Storno-Mail | 4 | J2 | â€“ |

## Sprint 5 Â· KW 42â€“43 (12.â€“25.10.) Â· Sperren, Kontingent, Admin-Kalender Â· ~35 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [ ] 5.1 | Block-CRUD mit RRULE, Materialisierung in Bookings (Saisonhorizont), Re-Materialisierung bei Ã„nderung ohne Verlust bestÃ¤tigter Termine | 6 | E1, E2 | Tests |
| [ ] 5.2 | Kontingent-Freigabe-Cron (`RELEASED`), Weiterverkauf als `RELEASE_RESALE` | 3 | E3 | â€“ |
| [ ] 5.3 | Vereins-Admin-Bereich: Kontingent bestÃ¤tigen/freigeben, Trainingsgruppe beschriften | 4 | E4 | â€“ |
| [ ] 5.4 | Admin-Kalender: Wochenansicht je Platz, manuelle Belegung (mit/ohne Rechnung, manuelle Zahlart), Sperre, Verschieben, Stornieren, No-Show | 12 | K4, G7, I4 | Drag & Drop optional |
| [ ] 5.5 | Dauerplatz-Ãœbersicht Saison (Raster), Konflikte, KÃ¼ndigung aus dem Kalender | 4 | K5 | â€“ |
| [ ] 5.6 | Betreiber-Massenstorno fÃ¼r Zeitraum (Hallenausfall) mit Guthaben/Erstattung + Sammelmail | 4 | I3 | â€“ |
| [ ] 5.7 | Audit-Log-Ansicht | 2 | K6 | â€“ |

## Sprint 6 Â· KW 44 (26.10.â€“01.11.) Â· Reports + Go-Live Stufe 2 Â· ~25 h

| # | Ticket | h | Ref | DoD |
|---|---|---|---|---|
| [ ] 6.1 | Report Auslastung (Tag/Woche/Zeitfenster/Platz) mit CSV | 5 | L1 | â€“ |
| [ ] 6.2 | Report Umsatz (Zeitraum, Produktart, Zahlart, Erstattungen) mit CSV | 4 | L2 | Summen stimmen mit Stripe-Auszahlungen Ã¼berein |
| [ ] 6.3 | **Report Vereinsnutzung** mit vier Quoten, Definitionstext, CSV + PDF | 6 | L3 | Sportamt-tauglicher Export |
| [ ] 6.4 | Report Dauerplatz-Quote | 2 | L4 | â€“ |
| [ ] 6.5 | Datenauskunft/Anonymisierung im Admin | 3 | A5 | Rechnungen bleiben erhalten |
| [ ] 6.6 | Go-Live-Checkliste Stufe 2, Lasttest Kalender, Uptime-Alarme | 5 | NF12 | â€“ |

**Stufe 2 live: vor HallenÃ¶ffnung** (nach aktuellem Stand KW 44, nachziehen falls Ã–ffnung spÃ¤ter).

## Sprint 7+ Â· Winter 1 laufend Â· Stufe 3 (Auswahl nach Bedarf)

| Ticket | h | Ref |
|---|---|---|
| Guthabenkonto + Verrechnung im Checkout | 8 | M1 |
| 10er-Karte (Minutenkontingent) | 10 | M2 |
| Gutscheine inkl. Widerrufsbelehrung | 10 | M3 |
| Warteliste + Benachrichtigung | 10 | D8, N1 |
| Kontingent-Selbstbuchung fÃ¼r Vereinsmitglieder | 12 | E5 |
| Bank-SEPA: GlÃ¤ubiger-ID, Mandat, Pre-Notification, pain.008-Export, RÃ¼cklastschrift-Import | 25 | G8 |
| Monatliche Dauerplatz-Abbuchung | 10 | F6 |
| DATEV-Export, Rechnungsausgangsbuch | 8 | H6 |
| TÃ¼rcode-Integration | 10â€“20 | K7 |
| Multi-Venue-Frontend, Standort-Onboarding-Assistent (fÃ¼r Standort 2) | 15 | P2 |
| Kohorten-Report | 5 | L5 |
| Kurse/Trainings | 25 | P1 |

---

## Go-Live-Checkliste Stufe 1

- [ ] RechtstrÃ¤ger entschieden (02.09.), aktiver `LegalEntity` gesetzt, Steuersatz vom Steuerberater bestÃ¤tigt
- [ ] Stripe Live-Account des ZahlungsempfÃ¤ngers verifiziert, SEPA-Lastschrift aktiviert, Webhook-Secret Live
- [ ] AGB, Datenschutz, Impressum, Widerrufshinweis final und versioniert
- [ ] AV-VertrÃ¤ge: Stripe, E-Mail-Provider, Hoster, Object Storage
- [ ] Preisregeln und Dauerplatz-Rabatt Winter 1 eingetragen und gegen Kalkulationstool geprÃ¼ft
- [ ] Testkauf Live mit 1 â‚¬ Produkt, Rechnung geprÃ¼ft (Pflichtangaben, Nummer, PDF-Hash), Erstattung getestet
- [ ] Backup lÃ¤uft tÃ¤glich, Restore einmal durchgespielt
- [ ] Sentry und Uptime-Alarm aktiv, Fehler-Mail an Janick
- [ ] Domain, TLS, E-Mail-Domain (SPF/DKIM/DMARC) eingerichtet
- [ ] Roland/Verein informiert, Vorverkaufs-Kommunikation vorbereitet

## Go-Live-Checkliste Stufe 2

- [ ] Vereinskontingent und Beach-Liga-Slots als Blocks eingetragen und mit Roland abgestimmt
- [ ] Ã–ffnungszeiten, SchlieÃŸtage (Weihnachten, Silvester), Zeitumstellung 25.10. geprÃ¼ft
- [ ] Storno-Regel, Mindestvorlauf, Horizont, `sepaLeadDays` gesetzt
- [ ] Erinnerungs-Cron, Hold-Cleanup, Freigabe-Cron laufen in Produktion (Monitoring)
- [ ] Staff-Accounts angelegt, Admin-Kalender-Schulung (15 min)
- [ ] Vereinsnutzungs-Report einmal mit Testdaten an Sportamt-Anforderung gespiegelt

