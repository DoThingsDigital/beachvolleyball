# CLAUDE.md – `dtd-booking`

Buchungs- und Abrechnungsplattform für Beachvolleyball-Hallen (Winter-Traglufthalle), Mandant 1: DoThingsDigital GmbH, Standort 1: Picco Beach, Köln. Ersetzt Eversports. Muss von Tag 1 mandantenfähig sein.

**Lies vor jeder Feature-Arbeit:** `docs/01_LASTENHEFT.md` (Anforderung + Akzeptanzkriterien), `docs/02_DATENMODELL.md` (Entitäten, Constraints, Zustandsautomaten, Preislogik), `docs/03_BACKLOG.md` (Ticket + DoD). Nach Abschluss: Backlog-Status aktualisieren.

## Stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL 16 · Prisma (Custom-SQL-Migrationen für Constraints) · Auth.js v5 · Stripe (Checkout + Webhooks) · Resend/Postmark + React Email · `@react-pdf/renderer` · Tailwind + shadcn/ui · Vitest · Playwright · pnpm

## Befehle

```
pnpm dev            # lokal
pnpm db:up          # Docker Postgres
pnpm prisma migrate dev
pnpm seed           # Winter-1-Stammdaten, idempotent
pnpm test           # Vitest
pnpm e2e            # Playwright
pnpm stripe:listen  # Stripe CLI → /api/webhooks/stripe
pnpm lint && pnpm typecheck
```

## Struktur

```
app/(public)/…        Kalender, Vorverkauf, Rechtstexte
app/(account)/…       Kundenkonto
app/(admin)/…         Backoffice, Vereins-Admin
app/api/webhooks/…    Stripe
src/domain/           reine Fachlogik, keine I/O: pricing, availability, invoice-number, state-machines
src/services/         Use-Cases mit DB/Stripe/Mail (orders, bookings, invoices, subscriptions, blocks)
src/db/               Prisma-Client, Tenant-Scoping, Repositories
src/email/            React-Email-Templates (versioniert im Dateinamen)
src/pdf/              Rechnungs-Layout
prisma/               schema.prisma, migrations/ (inkl. *.sql)
docs/                 Projektrahmen, Lastenheft, Datenmodell, Backlog
```

## Domänenregeln (Invarianten – nie brechen)

1. **Geld ist Integer-Cent.** Nie `number` mit Nachkommastellen für Beträge. Steuer wird pro Position gerundet, Summen aus gerundeten Positionen gebildet. Preisregeln speichern Brutto; Netto wird rückgerechnet.
2. **Preise nur serverseitig** über `src/domain/pricing.ts`. Der Client sendet nie einen Preis. Die Aufschlüsselung wird an `OrderItem.priceBreakdown` gespeichert.
3. **Jede Query ist mandantengefiltert** (`organisationId`). Repositories nehmen einen `TenantContext`; kein direkter `prisma.*`-Zugriff außerhalb von `src/db/`.
4. **Keine Doppelbelegung.** Das DB-Exclusion-Constraint ist die Wahrheit. Verfügbarkeitsprüfung in der App ist nur UX; ein `23P01`-Fehler wird als „Slot vergeben" behandelt, nicht als Bug.
5. **Belegungen werden nie gelöscht**, nur `CANCELLED`/`EXPIRED`/`RELEASED`. Nutzer werden anonymisiert, nicht gelöscht. Rechnungen sind unveränderlich; Korrektur nur per `CREDIT_NOTE`.
6. **Rechnungsnummern lückenlos** je Aussteller und Jahr, vergeben in derselben Transaktion wie der Insert, als letzter Schritt vor Commit (PDF vorher rendern).
7. **Zeit:** DB in UTC, Fachlogik in `Europe/Berlin` (`date-fns-tz` oder `Temporal`-Polyfill). Öffnungszeiten, Preisfenster, Wochentage und Slots werden immer in lokaler Zeit berechnet. Zeitumstellung 25.10.2026 liegt in der Saison – Tests dafür existieren und bleiben grün.
8. **Webhooks sind idempotent** (`WebhookEvent.eventId` unique) und reihenfolge-unabhängig. Statusübergänge laufen über die Zustandsautomaten in `src/domain/state-machines.ts`; ungültige Übergänge werfen.
9. **SEPA:** Bei `payment_intent.processing` gilt die Bestellung als bezahlt, wenn `confirmOnProcessing` aktiv. Bei späterem Fehlschlag: Gutschrift, Buchungen stornieren, `User.sepaBlocked = true`, Mail. Buchungen mit weniger als `sepaLeadDays` Vorlauf bekommen kein SEPA angeboten.
10. **Jede Belegung hat einen `usageType`** (KOMMERZIELL/VEREIN/LIGA/INTERN). Er ist Pflicht bei Anlage und wird nie nachträglich geraten. Der Vereinsnutzungs-Report hängt daran.
11. **Konfiguration statt Konstanten:** Raster, Fristen, Öffnungszeiten, Steuersätze, Rabatte, Feature-Flags kommen aus `Venue`/`Season`/`LegalEntity`/`Organisation.settings`, nie aus dem Code.
12. **Rechtsträger ist umschaltbar.** Rechnungen und Bestellungen speichern Aussteller-Snapshots. Code darf nie annehmen, dass DTD der Aussteller ist.

## Konventionen

- Server Actions für Formulare, Route Handler nur für Webhooks/Downloads. Eingaben immer mit Zod validieren.
- Fachlogik in `src/domain/` ist pure und wird mit Vitest getestet; `src/services/` wird mit Integrationstests gegen Test-Postgres getestet.
- Fehler: fachliche Fehler als `DomainError` mit Code (`SLOT_TAKEN`, `OUTSIDE_OPENING_HOURS`, `NO_PRICE_RULE`, …); nie Stacktraces an den Client.
- UI: deutsch, mobile-first, 375 px ohne horizontales Scrollen. Formatierung von Beträgen und Zeiten ausschließlich über `src/lib/format.ts`.
- Commits: Conventional Commits mit Ticket-Nummer aus dem Backlog (`feat(booking): hold + checkout (#4.3)`).
- Vor dem Merge: `pnpm lint && pnpm typecheck && pnpm test`. E2E vor jedem Deploy nach Staging.
- Secrets nur über Env; niemals in Fixtures oder Tests. IBAN nur als `last4` speichern, außer Bank-SEPA (verschlüsselt).

## Nicht tun

- Keine `localStorage`-Persistenz fachlicher Daten, keine clientseitige Preisberechnung
- Keine `DELETE` auf `Booking`, `Order`, `Invoice`, `Payment`, `Refund`, `User`
- Kein Update auf `Invoice` nach `issuedAt`
- Kein Hardcode von „Picco Beach", DTD, Steuersatz, Öffnungszeiten
- Keine Prisma-Aufrufe in React-Komponenten oder Server Actions direkt

## Glossar

Feldstunde = 1 Platz × 1 Stunde · Belegung/Booking = jede Nutzung eines Platzes (Kunde, Dauerplatz-Termin, Sperre) · Dauerplatz/Subscription = fester Wochenslot über die Saison · Sperre/Block = Belegungsregel ohne Kunde · Kontingent = wiederkehrende VEREIN-Sperren aus dem Vorvertrag · Freigabe/RELEASED = ungenutzter Vereins-Slot, der kommerziell buchbar wird · Vorhaltung vs. Auslastung = zwei Messbasen der Vereinsnutzung · Aussteller/LegalEntity = Rechnungsaussteller und Vertragspartner (Plan A: DTD GmbH, Plan B: Beachclub-Köln e.V.)
