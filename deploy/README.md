# Deployment (VPS, Ticket 0.5)

Zielbild: Docker Compose (App + Postgres) hinter dem System-nginx mit
Let's-Encrypt-TLS. Secrets liegen ausschließlich in `/opt/dtd-booking/.env`
auf dem Server (nie im Repo, nie im Chat).

## Layout auf dem Server

```
/opt/dtd-booking/.env        Secrets (DB_PASSWORD, AUTH_SECRET, Stripe, …)
/opt/dtd-booking/repo/       Git-Checkout (dieses Repo, main)
Volumes: dtd_pgdata (Postgres), dtd_invoices (Rechnungs-PDFs)
```

## Deploy

```
/opt/dtd-booking/repo/deploy/deploy.sh
```

zieht `origin/main`, baut das Image und startet neu; `prisma migrate
deploy` läuft beim Containerstart (Fehlschlag = Container startet nicht).

## Bausteine

- `Dockerfile` (Repo-Wurzel): volles Node-22-Image, `next build`
  ohne DB-Zugriff (alle Live-Seiten sind force-dynamic).
- `docker-compose.yml`: App nur auf `127.0.0.1:3000`, Postgres nur auf
  `127.0.0.1:5433` (für SSH-Tunnel-Wartung) – TLS terminiert nginx.
- `nginx-site.conf`: Vorlage für `/etc/nginx/sites-available/dtd-booking`.
- `dtd-booking.cron`: Vorlage für `/etc/cron.d/dtd-booking`
  (Hold-Ablauf alle 5 min, Kontingent-Freigabe + Erinnerungen stündlich).

## Betriebsnotizen

- DB-Backup: `docker compose exec db pg_dump -U dtd dtd_booking` (ein
  täglicher Cron mit Rotation liegt unter `/etc/cron.d/dtd-booking-backup`).
- Seed (einmalig/idempotent): `docker compose --env-file /opt/dtd-booking/.env -f deploy/docker-compose.yml exec app pnpm seed`
- Logs: `docker compose … logs -f app`
