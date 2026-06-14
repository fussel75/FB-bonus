#!/bin/sh
#
# docker-entrypoint.sh
#
# Wartet auf die Datenbank, führt Schema-Push + Migrationen + Seed aus
# und startet dann den eigentlichen Prozess (siehe CMD).
#
# Idempotent — kann bei jedem Container-Start ohne Schaden laufen.
# Seed und Migration überschreiben keine bestehenden Konfig-Werte.

set -e

# DB-Host aus DATABASE_URL extrahieren (postgresql://user:pass@HOST:PORT/db)
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\).*|\1|p')
DB_PORT="${DB_PORT:-5432}"

if [ -n "$DB_HOST" ]; then
  echo "→ Warte auf PostgreSQL bei $DB_HOST:$DB_PORT …"
  for i in $(seq 1 30); do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -q; then
      echo "  ✓ PostgreSQL bereit"
      break
    fi
    sleep 2
  done
fi

cd /app/packages/backend

echo "→ prisma db push (Schema synchronisieren)"
npx prisma db push --skip-generate --accept-data-loss=false

echo "→ Migration: kranktage_schwellenwert → kranktage_max_grenze"
tsx prisma/migrate-kranktage-max-grenze.ts || echo "  (übersprungen oder bereits angewendet)"

echo "→ Seed (idempotent — überschreibt keine Konfig-Werte)"
tsx prisma/seed.ts || echo "  (Seed-Fehler — Start trotzdem fortsetzen)"

# Stammdaten-Update nur ausführen wenn explizit gewünscht
if [ "${RUN_STAMMDATEN_UPDATE:-false}" = "true" ]; then
  echo "→ Stammdaten 2026 aktualisieren"
  tsx /app/scripts/update-stammdaten-2026.ts || echo "  (Update fehlgeschlagen — Start trotzdem fortsetzen)"
fi

cd /app
echo "→ Starte: $@"
exec "$@"
