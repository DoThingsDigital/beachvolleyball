# Handoff: Picco Winter Beach — Buchungssystem

## Overview
Design für das Buchungssystem des Standorts **Picco Winter Beach by Summerdome** (Winter-Beachvolleyball unter Traglufthalle, Köln). Flow: Startseite → Slot-Raster → Checkout → Bestätigung, Desktop + Mobile.

## About the Design Files
Die Datei `Picco Booking Design.dc.html` ist eine **Design-Referenz in HTML** — ein Prototyp, der Look und Verhalten zeigt, kein Produktionscode. Aufgabe: diese Designs in der bestehenden Codebase des Buchungssystems (Framework, Patterns, Libraries des Projekts) **nachbauen**. Existiert noch kein Frontend, freie Framework-Wahl (z. B. React + Tailwind).

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände und Copy sind final — pixelgenau umsetzen.

## Design Tokens

### Farben
| Token | Hex | Verwendung |
|---|---|---|
| sunset-coral | #FF6B4A | Primär-Buttons, Marke, selektierte Slots |
| coral-deep | #C43D20 | Links, Preise, Text-Akzente auf hell (AA 5,3:1) |
| sun-gold | #FFB347 | Bildmarken-Verlauf oben, Highlights |
| glow-light | #FFD97A | Hero-Sonnen-Glow |
| hero-gradient | linear-gradient(160deg, #FF8A5C, #FF6B4A 55%, #E8543A) | Hero-Flächen |
| ice | #8ED8EC | Winter-Badges (Temperatur, Hinweise) |
| ice-deep | #0E4E60 | Text auf ice |
| ink | #2B2118 | Text, Footer-/Summary-Bars, aktive Chips |
| driftwood | #6B655C | Sekundärtext (AA 5,6:1) |
| stone | #9A9284 | Tertiärtext, Placeholder |
| sand | #F2E3C6 | Hinweis-Cards |
| sand-dark | #6B5432 | Text auf sand |
| shell | #FFF6EA | Seiten-/App-Hintergrund |
| card-border | #E5E1D8 | Rahmen, Trennlinien |
| divider-warm | #EFE4CF | Header-Trennlinien auf shell |
| booked-bg | #EFE9DD | Belegte Slots |
| white | #FFFFFF | Cards, freie Slots, Inputs |

Regeln: Fließtext nur ink/driftwood auf shell/sand/weiß. sunset-coral nie als Textfarbe unter 24 px → coral-deep. ice nur als Akzent (Badges), nie großflächig.

### Typografie (Google Fonts)
- **Baloo 2** (600/700/800): Headlines, Buttons, Wortmarke. Nie unter 18 px, nie in Tabellen/Formularen.
- **Figtree** (400–800): UI, Fließtext, Labels, Preise, Slot-Raster.
- Skala (Desktop): H1 48/1.04 Baloo 800 · H2 20–22 Baloo 700 · Body 15–17/1.5 Figtree · Label 13 Figtree 700 · Small 12–13.5.

### Sonstige Tokens
- Radius: Buttons/Pills 999px · Cards 12px · Inputs/Slots 8–10px · Browser-Karten 14px
- Spacing: 4er-Raster; Card-Padding 18–22px; Seitenpadding Desktop 32px, Mobile 16px
- Buttons: Höhe 46–50px (Mobile min. 44px Hit-Target)
- Schatten: Cards flach (keine Schatten auf shell), Hero-Sonne `0 0 50–80px rgba(255,217,122,0.55)`

## Logo
- **Bildmarke „Glow"**: flacher Dom (Breite:Höhe ≈ 2,6:1), `border-radius:50% 50% 0 0 / 100% 100% 0 0`, Füllung `linear-gradient(180deg, #FFB347, #FF6B4A)`, darunter Grundlinie (ink, abgerundet, ragt seitlich leicht über).
- **Wortmarke**: „Picco" ink + „Winter Beach" coral, Baloo 2 800.
- **Endorsement** (Footer): „by SUMMERDOME" — Figtree 800, Letterspacing 0.18em, stone-farbig, Mini-Dom einfarbig; klein und sekundär.

## Screens / Views

### 1. Startseite (Desktop, `5a`)
- Header (shell, 1px divider-warm): Logo links; Nav „Slots · Events · Preise · Community" (Figtree 600, 14px); CTA-Pill „Feld buchen" (coral, Baloo 700).
- Hero (hero-gradient, Padding 56/40): H1 „Draußen Winter. / Hier: Sommer." (shell-Farbe), Subline #FFE0B8; CTA-Pill invertiert (shell-BG, coral-deep-Text) „Jetzt Slot sichern"; Winter-Badge `rgba(14,78,96,0.9)` mit ice-Text „❄ −2° draußen · 25° drinnen"; rechts unten glühender Dom (gold-Verlauf + Glow-Schatten), angeschnitten.
- 3 Info-Cards (weiß bzw. sand für „Nächster freier Slot"), flex mit gap 14.
- Footer: rechtliches links (stone), Endorsement rechts.

### 2. Slot-Raster (Desktop, `5b`)
- Header mit Fortschritt: „Schritt 1 von 3" + 3 Balken (26×5px, aktiv coral, inaktiv card-border).
- Tages-Chips (Pill): aktiv ink/weiß, inaktiv weiß mit Border. Rechts ice-Badge „60 Min pro Slot".
- Raster: CSS-Grid `64px repeat(4, 1fr)`, gap 6px; Zeilen = Stunden (16:00–21:00), Spalten = Feld 1–4. Zell-Zustände (min-height 46px, radius 8):
  - **Frei**: weiß, Border card-border, Preis coral-deep 700; Hover: Border coral + 1px Ring.
  - **Belegt**: booked-bg, Text „Belegt" stone, nicht klickbar.
  - **Ausgewählt**: coral, weiß, „✓ 34 €".
- Sticky Summary-Bar (ink): Auswahl-Text links, „Weiter"-Pill coral rechts.

### 3. Checkout (Desktop, `5c`)
- Fortschritt „Schritt 2 von 3", 2 Balken aktiv.
- Links Formular: Vor-/Nachname (2-spaltig), E-Mail (Fokus-Zustand: 2px coral Border + Hilfetext), Zahlungsart als 3 Karten-Toggles (aktiv: 2px ink Border + ✓; inaktiv: 1px card-border, driftwood).
- Rechts Summary-Card (weiß, radius 12): Posten, Trennlinie, Gesamt, CTA „Verbindlich buchen" (coral Pill, 48px), Storno-Hinweis (stone, 12px, zentriert).
- Inputs: 46px hoch, weiß, radius 10, 1px card-border; Label 13px Figtree 700 darüber.

### 4. Mobile (`5d`, 3 Screens, Breite 390 gedacht, Mock 300px)
- **Start**: Hero-Gradient mit Logo, H1, Winter-Badge, angeschnittenem Glow-Dom; darunter CTA-Stack: Primär-Pill coral 50px, Sekundär-Pill Outline ink 46px, sand-Card „Nächster freier Slot".
- **Slot-Liste**: Liste statt Raster — Zeile pro Slot (weiß, radius 12, 50px): links „19:00 · Feld 3", rechts Preis coral-deep; ausgewählt = coral/weiß mit ✓. Unten „Weiter · 34 €" (ink Pill).
- **Bestätigung**: Hero-Gradient mit ✓-Kreis (shell) + „Dein Sommer ist gebucht!"; Buchungs-Card; ice-Hinweis-Card („Tipp: Schuhe aus…"); „Zum Kalender hinzufügen" Outline-Pill.

## Interactions & Behavior
- Slot-Klick (frei) → Auswahl (max. 1) → Summary-Bar erscheint/aktualisiert. Erneuter Klick deselektiert.
- Belegte Slots: kein Pointer, kein Hover.
- Tages-Chips wechseln das Raster (Fade 150ms ease-out reicht).
- Checkout-Validierung: E-Mail-Format, Pflichtfelder; Fehler: Border coral-deep + Hinweistext 12,5px darunter.
- Buttons Hover: coral → #E8543A abdunkeln; Outline-Buttons: BG shell.
- „Verbindlich buchen" → Loading-State (Spinner im Button, Text „Wird gebucht…") → Bestätigung.
- Responsive: <768px Slot-Raster → Slot-Liste (Mobile-Pattern); Summary-Bar sticky bottom.

## State Management
- `selectedDate`, `selectedSlot {courtId, time, price}`, `bookingStep (1–3)`, `customer {firstName, lastName, email}`, `paymentMethod`, `bookingStatus (idle|loading|confirmed|error)`.
- Daten: Slots pro Tag laden (`GET /slots?date=`), Buchung anlegen (`POST /bookings`). Belegt-Status serverseitig.

## Tonalität (Copy)
Du-Form, locker, herzlich. Kontrast als Motiv: „Draußen Winter. Hier: Sommer.", Grad-Angaben als Badges. Keine Sport-Performance-Sprache.

## Assets
Keine Bild-Assets — Logo und Sonne sind reine CSS-Formen (siehe Logo-Sektion). Fonts via Google Fonts (`Baloo 2`, `Figtree`).

## Files
- `Picco Booking Design.dc.html` — alle 4 Screens (Desktop Start / Slot-Raster / Checkout, Mobile-Trio), im Browser zu öffnen.
