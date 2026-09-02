# Lasttest Kalender (Ticket 6.6)

Stand: 02.09.2026 · Ziel: NF aus 4.1 („Wochenansicht < 1 s") unter Last
bestätigen. Werkzeug: `autocannon` gegen das Staging
(`https://buchen.72-61-88-8.sslip.io/kalender`, Commit db61757, Hostinger-VPS
hinter nginx/TLS, App im Docker-Container, Postgres auf demselben Host).
Die Seite wird pro Request komplett serverseitig gerendert (~75 KB HTML);
der Occupancy-Cache pro Woche/Standort war warm.

## Ergebnisse

| Szenario | Dauer | Requests | Durchsatz | p50 | p90 | p99 | Max | Fehler |
|---|---|---|---|---|---|---|---|---|
| 10 gleichzeitige Nutzer (Normallast) | 20 s | 866 | ~43 Seiten/s | 205 ms | 341 ms | 611 ms | 839 ms | 0 |
| 50 gleichzeitige Nutzer (Spitzenlast) | 30 s | 1000 | ~35 Seiten/s | 1285 ms | 1593 ms | 2035 ms | 2077 ms | 0 |

## Einordnung

- **Normallast erfüllt die NF deutlich**: Auch das 99. Perzentil bleibt unter
  1 s, kein einziger Fehler. 10 dauerhaft gleichzeitig ladende Nutzer
  entsprechen weit mehr als dem erwarteten Publikum eines 4-Feld-Standorts.
- **Bei 50 dauerhaft gleichzeitigen Renders** sättigt die CPU des VPS und die
  Antwortzeiten steigen auf ~1,3–2 s — ohne Fehler oder Abbrüche. Das ist ein
  Dauerfeuer-Szenario (jede Verbindung lädt ununterbrochen neu), kein
  realistischer Betriebszustand; als Verhalten unter Überlast ist „langsamer,
  aber stabil" das gewünschte Ergebnis.
- Reserven, falls später nötig: größerer VPS, oder Kalender-HTML pro
  Woche/Standort kurz cachen (der Occupancy-Cache existiert bereits, gecacht
  würde dann zusätzlich das Rendering).

## Reproduzieren

```bash
pnpm dlx autocannon -c 10 -d 20 --latency https://buchen.72-61-88-8.sslip.io/kalender
```

Nach dem Umzug auf die echte Domain die URL anpassen und einmal wiederholen.
