# Projektrahmen – Buchungsplattform (Arbeitstitel `dtd-booking`)

Stand: 29.08.2026 · Owner: Janick Ast (DoThingsDigital GmbH) · Entwicklung: Janick mit Claude Code · Support/Review: Juri (Codeligence GmbH)

## 1. Ziel

Eigene Buchungs- und Abrechnungsplattform für die Winter-Beachhalle Picco Beach (Köln-Mülheim), die

1. Eversports ersetzt (Platzbuchung, Vorverkauf, Zahlung, Rechnung, Admin),
2. den Vereinsnutzungsnachweis (≥ 51 %) automatisiert und exportierbar macht,
3. von Tag 1 mandantenfähig ist, damit sie als Baustein „Administration" des Plan-B-Dreivertragsmodells an weiteren Vereinsstandorten wiederverwendet werden kann.

## 2. Nicht-Ziele (Winter 1)

- Marktplatz / Discovery, native App, Push
- Kurse, Trainerverwaltung, Payroll, Video, Kasse/POS
- Bank-SEPA über Hausbank (pain.008) → Stufe 3
- E-Rechnung / XRechnung (nur B2B relevant) → bei Bedarf
- Mehrsprachigkeit (nur Deutsch)

## 3. Stufen und Termine

| Stufe | Inhalt | Ziel |
|---|---|---|
| **1 Vorverkauf** | Kundenkonto, Dauerplatz-Shop, Stripe-Checkout (SEPA/Karte), Rechnung als PDF, Admin: Bestellungen/Kunden/Erstattung, Rechtstexte | **KW 40** (02.10.2026) |
| **2 Betrieb** | Öffentlicher Slot-Kalender, Einzelbuchung mit Hold, Preisregeln, Sperren + Vereinskontingent, Storno-Regeln, Admin-Kalender, Reports (Auslastung, Umsatz, Vereinsnutzung) | **KW 44** (vor Hallenöffnung, Annahme Ende Okt./Anfang Nov.) |
| **3 Ausbau** | 10er-Karten, Gutscheine, Warteliste, Kontingent-Selbstbuchung für Vereinsmitglieder, Bank-SEPA, DATEV-Export, Türcode, Multi-Venue-UI | laufend Winter 1 → Sommer 2027 |

Der Termin für Stufe 2 hängt an der Hallenöffnung; die wiederum an Sportamt (02.09.), UNB und Hallenbeschaffung. Stufe 2 wird zeitlich hinter der Öffnung geplant, nicht davor.

## 4. Rahmenbedingungen (fachlich, rechtlich)

**Rechtsträger umschaltbar.** Plan A: DTD GmbH ist Vertragspartner und Rechnungsaussteller. Plan B: Beachclub-Köln e.V. ist formaler Betreiber, DTD administriert. Entscheidung fällt nach dem Sportamt/Rechtsamt-Termin am 02.09. → Konzept `LegalEntity` (Rechnungsaussteller) pro Standort, Rechnungen speichern einen Aussteller-Snapshot. Umschalten ist eine Konfigurationsänderung, keine Migration.

**Zahlungsempfänger = Rechnungsaussteller.** Bei Plan B entweder Stripe-Account des Vereins oder Stripe Connect mit DTD als Plattform. Offen (siehe §8).

**Umsatzsteuer.** Platzmiete durch die GmbH: 19 %. Beim Verein ggf. abweichend (Mitglieder/Nichtmitglieder, Zweckbetrieb). → Steuersatz pro Produkt und pro Aussteller konfigurierbar. Mit Steuerberater klären, bevor die erste Rechnung rausgeht.

**Rechnungspflicht.** Platzmiete ist eine grundstücksbezogene Leistung → Rechnung auch an Privatkunden innerhalb von 6 Monaten (§ 14 Abs. 2 Nr. 1 UStG). Ab 250 € brutto ist die Empfängeradresse Pflicht → Rechnungsadresse im Checkout erfassen, Dauerplätze liegen typischerweise darüber.

**Widerruf.** Buchungen mit festem Termin (Slot, Dauerplatz) fallen unter die Ausnahme § 312g Abs. 2 Nr. 9 BGB (Freizeitdienstleistungen mit spezifischem Termin). Gutscheine/10er-Karten nicht → Widerrufsbelehrung ab Stufe 3. Anwaltlich absichern.

**Kein Surcharging.** Kein Aufschlag auf Lastschrift/Karte (§ 270a BGB); PayPal-Aufschlag ist nach PayPal-AGB unzulässig. PayPal wird eingepreist oder nicht angeboten.

**DSGVO.** EU-Hosting, AV-Verträge mit Stripe, E-Mail-Provider, Hoster, Object Storage. Keine Tracking-Cookies im MVP. Rechnungen 10 Jahre aufbewahren → Kundendaten werden anonymisiert, nicht gelöscht. Auskunft/Export als Admin-Funktion.

**GoBD.** Rechnungen sind nach Ausstellung unveränderlich (PDF + JSON-Snapshot + Hash). Korrektur nur durch Stornorechnung/Gutschrift. Lückenlose Nummernkreise pro Aussteller und Jahr.

**Zeit.** Zeitzone `Europe/Berlin` für alles Fachliche, Speicherung in UTC. Saison Oktober–April; das Enddatum ist Konfiguration (Fliegender Bau, max. 6 Monate Standzeit).

**Vereinsnutzung ≥ 51 %.** Messbasis ist noch nicht mit dem Sportamt fixiert (Feldstunden vs. Uhrzeiten, Vorhaltung vs. Auslastung). Der Report muss beide Basen ausweisen; jede Belegung trägt deshalb ein `usageType`.

## 5. Stack (Empfehlung – mit Juri abstimmen)

| Schicht | Wahl | Begründung |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Ein Repo, Server Actions, gut für Claude Code |
| Datenbank | PostgreSQL 16 | Exclusion Constraints (Doppelbuchungsschutz), Row-Locks für Nummernkreise |
| ORM | Prisma + Custom-SQL-Migrationen für Constraints | Alternativ Drizzle |
| Auth | Auth.js v5, Magic Link + Passwort | Rollen pro Organisation |
| Zahlung | Stripe Checkout (Stufe 1) → Payment Element (Stufe 2 prüfen); Webhooks | SEPA-Mandat, SCA, Rücklastschrift-Handling inklusive |
| E-Mail | Resend oder Postmark (EU-Region), React Email | Templates versionierbar |
| PDF | `@react-pdf/renderer` | Kein Headless-Browser |
| UI | Tailwind + shadcn/ui | Mobile-first, schnell |
| Tests | Vitest (Pricing, Konfliktlogik), Playwright (Checkout E2E) | |
| Hosting | Vorhandener Hostinger-VPS (Standort Deutschland) + Coolify; Option: Postgres managed (Neon/Supabase EU) statt im Container | EU-Datenhaltung, Server vorhanden; Voraussetzung: KVM-VPS, kein Shared-Webhosting; externes nächtliches DB-Backup Pflicht |
| Storage | S3-kompatibel EU (Hetzner Object Storage, R2 EU) für Rechnungs-PDFs | |
| Monitoring | Sentry, Uptime-Check, tägliche DB-Backups | |

## 6. Aufwand und Kapazität

| Stufe | Aufwand | Annahme |
|---|---|---|
| 0 Setup | ~15 h | |
| 1 Vorverkauf | ~85 h | |
| 2 Betrieb | ~100 h | |
| 3 Ausbau | 150–250 h | inkrementell |

Kapazität: Janick 20–25 h/Woche mit Claude Code, Juri 3–5 h/Woche Review/Pairing. Stufe 0–2 ≈ 200 h bis KW 44 = 9 Wochen → machbar, Puffer gering. Wenn Stufe 1 in KW 40 wackelt: Fallback Vorverkauf über Stripe Payment Links + manuelle Rechnung, Plattform folgt.

## 7. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| 02.09. ändert Rechtsträger/Zahlungsempfänger | Stripe-Account, AGB, Rechnungslayout | `LegalEntity`-Switch; Stripe erst nach Entscheidung produktiv schalten |
| Zeitkollision mit UNB, Finanzierung, Hallenbeschaffung | Stufe 1 rutscht | Fallback Payment Links; Backlog strikt nach Priorität |
| SEPA-Rücklastschriften | Forderungsausfall + Gebühr je Fall | Buchung bei Fehlschlag automatisch stornieren, Kunde für SEPA sperren; kurzfristige Buchungen (< 5 Tage) nur per Karte |
| Doppelbuchung | Vertrauensverlust | DB-Exclusion-Constraint + Hold; Unit-Tests |
| Checkout-Session läuft nach Hold-Ablauf noch durch | Bezahlter, aber vergebener Slot | Webhook prüft Verfügbarkeit erneut; bei Konflikt Auto-Refund + Mail |
| GoBD-Verstoß | steuerlich | Rechnungen immutable, Storno via Gutschrift |
| Steuersatz Verein falsch | Nachzahlung | Steuerberater vor erster Rechnung, Steuersatz konfigurierbar |

## 8. Offene Entscheidungen

1. Stack-Freigabe (Juri) — *vorläufig entschieden am 31.08.2026 (Janick): Stack wie §5 umgesetzt (Next.js 15.5, Postgres 16, Prisma 7 mit Driver-Adapter, Tailwind v4/shadcn, Vitest/Playwright). Juri-Review folgt nachgelagert; Abweichungen werden als Migration behandelt.*
2. Zahlungsempfänger bei Plan B: Stripe-Account des Vereins vs. Stripe Connect
3. Preisliste Winter 1: Peak/Off-Peak, Wochenende, Mitgliederpreis, Dauerplatz-Rabatt → Input aus `Kalkulationstool_Picco_Beach_v2.xlsx`
4. Storno-Regel (Vorschlag: bis 24 h vorher kostenlos, danach 100 %; bei Hallenstörung Guthaben statt Rückzahlung)
5. Dauerplatz-Zahlung Winter 1: nur Vorkasse (empfohlen, Working Capital) oder zusätzlich monatlich
6. Kontingent-Freigabe: ab wann werden ungenutzte Vereinsslots kommerziell buchbar (Vorschlag 48 h vorher), und zählt die Vorhaltung dann noch als Vereinsnutzung (Sportamt-Frage)
7. Mindestvorlauf für Online-Buchung (Vorschlag 1 h) und Buchungshorizont (Vorschlag 14 Tage, Mitglieder 21 Tage)
8. PayPal ja/nein (Kostenaufschlag ~1,50 € pro 60-€-Buchung gegenüber SEPA)
