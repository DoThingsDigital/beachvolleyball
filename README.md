# dtd-booking

Buchungs- und Abrechnungsplattform für Beachvolleyball-Hallen (Winter-Traglufthalle). Mandant 1: DoThingsDigital GmbH, Standort 1: Picco Beach, Köln.

Projektrahmen, Lastenheft, Datenmodell und Backlog liegen in [docs/](docs/). Arbeitsregeln für die Entwicklung: [CLAUDE.md](CLAUDE.md).

## Setup

Voraussetzungen: Node ≥ 20, pnpm, Docker Desktop.

```bash
pnpm install
cp .env.example .env
pnpm db:up              # Postgres 16 im Container
pnpm prisma migrate dev # Migrationen anwenden (inkl. btree_gist)
pnpm dev
```

## Befehle

| Befehl | Zweck |
|---|---|
| `pnpm dev` | Dev-Server |
| `pnpm db:up` | Docker Postgres starten |
| `pnpm prisma migrate dev` | Migrationen anwenden/erzeugen |
| `pnpm test` | Vitest (Unit, `src/**/*.test.ts`) |
| `pnpm e2e` | Playwright (Chromium + Mobile 375 px) |
| `pnpm lint && pnpm typecheck` | Pflicht vor jedem Merge |
| `pnpm format` | Prettier |

## Migrationen mit Custom-SQL

Constraints, die Prisma nicht abbilden kann (Exclusion-Constraints, Extensions, Trigger), leben direkt in den `migration.sql`-Dateien:

1. Schema in `prisma/schema.prisma` ändern
2. `pnpm prisma migrate dev --create-only --name <name>`
3. Erzeugte `prisma/migrations/<ts>_<name>/migration.sql` um Custom-SQL ergänzen
4. `pnpm prisma migrate dev` wendet sie an

Beispiel: `prisma/migrations/00000000000000_init_extensions/` aktiviert `btree_gist` für das Doppelbuchungs-Constraint (`docs/02_DATENMODELL.md`, „Kritische Constraints").
