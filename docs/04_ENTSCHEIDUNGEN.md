# Entscheidungslog `dtd-booking`

Kurze, datierte Architektur- und Produktentscheidungen (ADR-Stil).
Neueste oben. Format: Kontext → Optionen → Entscheidung → Folgen.

---

## E-003 · 2026-09-01 · Einzelbuchung bleibt bei Stripe Hosted Checkout (Ticket 4.7)

**Kontext.** Der Hold auf einen Slot gilt `venue.holdMinutes` (Default 15 min).
Eine Stripe-Checkout-Session hat aber eine Mindestlaufzeit von 30 Minuten
(`expires_at` ≥ +30 min). Es gibt also ein Fenster, in dem der Kunde noch
bezahlen kann, obwohl der Hold schon abgelaufen ist und der Slot wieder frei
oder sogar neu vergeben wurde. Ticket 4.7 fragt, ob das eingebettete Payment
Element (eigene Payment-UI, PaymentIntent direkt) das besser löst.

**Option A – Hosted Checkout behalten (Status quo).**
- Bereits produktionsreif umgesetzt und getestet: Kauffluss-E2E, echter
  SEPA-Sandbox-Kauf, idempotente Webhooks, `sepaLeadDays`-Regel.
- Das Konfliktfenster ist abgedeckt: Zahlt jemand nach Hold-Ablauf und der
  Slot ist inzwischen weg, greift `handleConflictAfterExpiry` –
  automatische Rückerstattung plus Mail (`checkout-conflict`), getestet in
  `src/services/conflict.int.test.ts`.
- PCI-Aufwand minimal (SAQ A), Zahlarten kommen aus dem Stripe-Dashboard.
- Nachteil: Redirect zu Stripe (Bruch im CI-Design), 30-min-Fenster bleibt
  als seltener Ausnahmefall (Erstattung statt Verhinderung).

**Option B – Payment Element eingebettet.**
- Volle Kontrolle: PaymentIntent wird beim Hold-Ablauf storniert, das
  Konfliktfenster verschwindet fast vollständig; kein Redirect, CI bleibt.
- Kosten: eigene Zahlungs-UI (Karte + SEPA + Wallets), zusätzliche
  Webhook-/Fehlerpfade, SEPA-Mandat-Handling selbst bauen (heute erledigt
  Checkout das via `setup_future_usage`), grob 1–2 Tage plus E2E-Umbau.
  Fehleranfälliger kurz vor dem Saisonstart.

**Entscheidung.** Für Winter 1 bleibt die Einzelbuchung beim Hosted
Checkout. Der Konfliktpfad (Auto-Refund + Mail) ist der akzeptierte
Kompromiss für das 15/30-Minuten-Fenster. `holdMinutes` bleibt bei 15 –
längere Holds würden Slots unnötig blockieren.

**Wiedervorlage.** Nach dem Go-Live messen: Anzahl automatischer
Konflikt-Erstattungen pro Monat (Query auf `Refund` mit
`reason = CHECKOUT_CONFLICT`). Ab ~5/Monat oder bei UX-Beschwerden über den
Redirect wird Payment Element als eigenes Ticket eingeplant.

---

## E-002 · 2026-08-31 · Rechnungen entstehen im Tool, nicht bei Stripe

**Kontext.** Frage, ob Stripe Invoicing die Rechnungen erzeugen soll.

**Entscheidung.** Rechnungen (und Gutschriften) erzeugt das Tool selbst:
lückenlose Nummernkreise je Aussteller und Jahr (§14 UStG), umschaltbarer
Rechtsträger (Plan A/B) mit Aussteller-Snapshot, eigenes PDF-Layout im CI.
Stripe Invoicing kann lückenlose deutsche Nummernkreise je Aussteller und
den Rechtsträgerwechsel nicht sauber abbilden und kostet pro Rechnung.

**Folgen.** `src/db/invoices.ts` vergibt Nummern per Sequenz-Zeilensperre in
derselben Transaktion wie den Insert; PDF wird vor dem Commit gerendert und
gespeichert; Korrekturen nur per `CREDIT_NOTE` im selben Nummernkreis.

---

## E-001 · 2026-08-31 · Buchungssystem als eigenständige App auf Subdomain

**Kontext.** Frage, ob das Buchungssystem in ein CMS/die Marketing-Website
eingebettet wird oder eigenständig bleibt.

**Entscheidung.** Das Buchungssystem bleibt eine eigene Next.js-App auf
eigener (Sub-)Domain (z. B. `buchen.…`). Marketing-Site/CMS laufen separat
und verlinken auf die App.

**Folgen.** Kein CMS-Kopplungscode; das CI (Picco Winter Beach by
Summerdome) ist direkt in der App umgesetzt; Rechtstexte liegen als
versionierte Inhalte in `src/content/legal.ts`.
