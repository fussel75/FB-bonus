# syntax=docker/dockerfile:1.6
#
# Multi-Stage Dockerfile für BonusTrack
#   Stage 1 (builder): kompiliert Backend + Frontend
#   Stage 2 (runtime): node:20-alpine mit gebauten Outputs
#
# Backend serviert das Frontend auf Port 5000 (siehe packages/backend/src/index.ts).

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# bookworm-slim (Debian 12) statt alpine: bringt OpenSSL 3 mit, vermeidet
# "Could not parse schema engine response"-Fehler von Prisma auf musl-libc.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# OpenSSL für Prisma-Engine (libssl3 + ca-certificates für npm/Git/HTTPS)
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Workspace-Manifeste zuerst → bessere Layer-Cache-Nutzung
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# Vollständige Installation (inkl. devDependencies für Build + ts-node)
RUN npm ci

# Prisma-Schema kopieren und Client generieren (vor restlichen Sources, weil
# sich das Schema selten ändert)
COPY packages/backend/prisma packages/backend/prisma
RUN cd packages/backend && npx prisma generate

# Restliche Sources
COPY packages/backend packages/backend
COPY packages/frontend packages/frontend
COPY scripts scripts

# Backend (tsc) + Frontend (vite) bauen
RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# openssl für Prisma + postgresql-client für pg_isready im Entrypoint + dumb-init
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl postgresql-client dumb-init ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# tsx global für entrypoint (seed, migration, stammdaten-update)
# tsx statt ts-node: läuft auf Node 20 ohne ESM/CJS-Klimmzüge
RUN npm install -g tsx

# Manifeste + komplette node_modules aus builder (enthält Prisma Engines)
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY --from=builder /app/node_modules ./node_modules

# Gebaute Outputs
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/frontend/dist packages/frontend/dist

# Prisma-Schema + Migrations-Skripte + Stammdaten-Skript (ts-node beim Start)
COPY packages/backend/prisma packages/backend/prisma
COPY scripts scripts

# Uploads-Verzeichnis als Mount-Point
RUN mkdir -p packages/backend/uploads

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5000

# dumb-init forwarded SIGTERM korrekt an Node
ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "packages/backend/dist/index.js"]
