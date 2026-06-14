# Deployment — Hostinger Docker Manager (mit Traefik)

App-URL: **https://fb-bonus.fristd-bau.com**

## Voraussetzungen (sollten bei dir schon stehen)

- ✅ Traefik-Container läuft mit Let's-Encrypt-Resolver
- ✅ DNS A-Record `fb-bonus.fristd-bau.com` zeigt auf die VPS-IP
- ✅ Externes Docker-Netzwerk existiert (üblich: `proxy`)

Falls das externe Netzwerk anders heißt: in `.env` `TRAEFIK_NETWORK` anpassen.
Den Namen des Let's-Encrypt-Resolvers findest du in deiner `traefik.yml` /
`traefik.toml` — Variable `TRAEFIK_CERT_RESOLVER` entsprechend setzen.

## Setup (einmalig)

### 1. Projekt im Hostinger Docker Manager anlegen

- VPS → Docker Manager → „Ein Projekt erstellen"
- Projektname: `fb-bonus`

### 2. Repo im Projektordner klonen

Hostinger Docker Manager braucht den Build-Context lokal:

```bash
# Im VPS-Terminal — Pfad gemäß Hostinger-Setup
cd /opt/docker-projects/fb-bonus
git clone https://github.com/fussel75/FB-bonus.git .
```

### 3. docker-compose.yml einfügen

- Im Docker-Manager-UI Tab `.yaml-Editor` öffnen
- Inhalt von [docker-compose.yml](./docker-compose.yml) einfügen

### 4. Umgebungsvariablen setzen

Tab `Umgebung` aufklappen — Vorlage: [.env.docker.example](./.env.docker.example)

| Variable | Wert |
|---|---|
| `POSTGRES_USER` | `bonustrack` |
| `POSTGRES_DB` | `bonustrack` |
| `POSTGRES_PASSWORD` | starkes Passwort, min. 24 Zeichen |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | `8h` |
| `PARTNER_API_KEY` | von FriStD |
| `RESEND_API_KEY` | leer lassen (oder dein Resend-Key) |
| `APP_DOMAIN` | `fb-bonus.fristd-bau.com` |
| `TRAEFIK_NETWORK` | Name deines Traefik-Netzes (Default `proxy`) |
| `TRAEFIK_CERT_RESOLVER` | Name aus deiner traefik.yml (Default `letsencrypt`) |
| `TRAEFIK_HTTP_ENTRYPOINT` | `web` |
| `TRAEFIK_HTTPS_ENTRYPOINT` | `websecure` |
| `RUN_STAMMDATEN_UPDATE` | **`true`** beim ersten Deploy, danach `false` |

### 5. „Bereitstellen" klicken

Docker baut das Image (~3–5 Min beim ersten Mal). Beim Start läuft automatisch:
- `prisma db push` (Schema erstellen)
- `migrate-kranktage-max-grenze.ts` (Konfig-Migration)
- `prisma/seed.ts` (Default-Admin + Konfig-Defaults)
- Bei `RUN_STAMMDATEN_UPDATE=true`: `scripts/update-stammdaten-2026.ts`

Traefik holt sich automatisch ein Let's-Encrypt-Zertifikat für die Subdomain.

### 6. Erster Login

- URL: https://fb-bonus.fristd-bau.com
- Default: `admin@bonustrack.app` / `BonusTrack2024!`
- **Sofort Passwort ändern!**

### 7. Nach erfolgreichem Start

- `RUN_STAMMDATEN_UPDATE` zurück auf `false` setzen
- Container neu starten („Neu bereitstellen")

## Updates ausrollen

```bash
cd /opt/docker-projects/fb-bonus
git pull
docker compose up -d --build
```

Schema-Migrationen + Seeds laufen beim Start automatisch (idempotent).

## Logs

- Hostinger Docker Manager → Tab „Protokolle"
- Oder: `docker compose logs -f app`

## Datensicherung

Volume `pgdata` enthält die komplette Datenbank.

```bash
docker compose exec postgres pg_dump -U bonustrack bonustrack > backup-$(date +%F).sql
```

Restore:
```bash
cat backup-2026-06-14.sql | docker compose exec -T postgres psql -U bonustrack bonustrack
```

## Konfiguration nach Deploy

In der Admin-UI → Konfiguration prüfen/setzen:
- `ganzjahres_bedingung_mindest_monate_im_jahr=6` (damit Franz mit Austritt 18.07.2026 qualifiziert bleibt)
- Krankheits-Staffel-Defaults nach Bedarf anpassen (Karenz 15, Abzug 4 %, Maxgrenze 40)
- Stundenlöhne pro Mitarbeiter eintragen (Admin → Mitarbeiter), sonst greift § 4a EFZG nicht

## Troubleshooting

**Traefik findet den Container nicht / 404**
- Hängt der Container im Traefik-Netzwerk? `docker network inspect proxy` und prüfen ob `fb-bonus-app-1` (o.ä.) drin ist
- `TRAEFIK_NETWORK` stimmt mit dem Namen im Traefik-Setup überein?
- Traefik-Logs: `docker logs traefik -f`

**Zertifikat wird nicht ausgestellt**
- DNS A-Record zeigt auf die richtige IP? `dig fb-bonus.fristd-bau.com`
- Port 80 und 443 in Traefik freigegeben?
- `TRAEFIK_CERT_RESOLVER` stimmt mit dem Namen in `traefik.yml` überein?
- Let's-Encrypt-Logs in Traefik prüfen
