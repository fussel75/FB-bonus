# Deployment — Hostinger Docker Manager

## Setup (einmalig)

1. **Projekt anlegen**
   - Hostinger → VPS → Docker Manager → „Ein Projekt erstellen"
   - Projektname: `fb-bonus`

2. **docker-compose.yml einfügen**
   - Tab `.yaml-Editor` öffnen
   - Inhalt von [docker-compose.yml](./docker-compose.yml) einfügen
   - **Wichtig:** Im `build:`-Block den Pfad zum Repo angeben (siehe „Repo bereitstellen" unten)

3. **Umgebungsvariablen setzen**
   - Tab `Umgebung` aufklappen
   - Folgende Keys eintragen (Vorlage: [.env.docker.example](./.env.docker.example)):
     ```
     POSTGRES_USER=bonustrack
     POSTGRES_DB=bonustrack
     POSTGRES_PASSWORD=<starkes_pw>
     JWT_SECRET=<openssl rand -base64 48>
     JWT_EXPIRES_IN=8h
     PARTNER_API_KEY=<von_fristd>
     RESEND_API_KEY=               # optional
     APP_PORT=5000
     RUN_STAMMDATEN_UPDATE=true    # NUR beim ersten Deploy, danach false
     ```

4. **Repo bereitstellen**
   - Im VPS-Terminal:
     ```bash
     cd /opt/docker-projects/fb-bonus       # genauer Pfad: siehe Hostinger-UI
     git clone https://github.com/fussel75/FB-bonus.git .
     ```
   - Oder Repo per Volume-Mount einbinden, je nach Hostinger-Setup.

5. **Bereitstellen klicken**
   - Docker baut das Image (~3–5 Min beim ersten Mal)
   - Beim Start läuft automatisch:
     - `prisma db push` (Schema erstellen)
     - `migrate-kranktage-max-grenze.ts` (Konfig-Migration)
     - `prisma/seed.ts` (Default-Admin + Konfig-Defaults)
     - Wenn `RUN_STAMMDATEN_UPDATE=true`: `scripts/update-stammdaten-2026.ts`

6. **Default-Admin-Login**
   - `admin@bonustrack.app` / `BonusTrack2024!`
   - **Sofort Passwort ändern!**

7. **Nach erstem erfolgreichen Start**
   - `RUN_STAMMDATEN_UPDATE` zurück auf `false` setzen
   - Container neu starten (Hostinger-UI: „Neu bereitstellen")

## Updates ausrollen

```bash
git pull
docker compose up -d --build
```

Schema-Migrationen + Seeds laufen beim Start automatisch (idempotent).

## Logs

- Hostinger Docker Manager → Tab „Protokolle"
- Oder im Terminal: `docker compose logs -f app`

## Datensicherung

- Volume `pgdata` enthält die komplette Datenbank
- Backup: `docker compose exec postgres pg_dump -U bonustrack bonustrack > backup-$(date +%F).sql`

## Konfiguration nach Deploy

In der Admin-UI → Konfiguration prüfen/setzen:
- `ganzjahres_bedingung_mindest_monate_im_jahr=6` (damit Franz mit Austritt 18.07.2026 qualifiziert bleibt)
- Krankheits-Staffel-Defaults nach Bedarf anpassen (Karenz 15, Abzug 4 %, Maxgrenze 40)
- Stundenlöhne pro Mitarbeiter eintragen (Admin → Mitarbeiter), sonst greift § 4a EFZG nicht
