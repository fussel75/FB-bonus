#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install --workspaces --if-present

echo "[post-merge] Pushing Prisma schema..."
cd packages/backend && npx prisma db push --accept-data-loss && cd ../..

echo "[post-merge] Building frontend..."
cd packages/frontend && npm run build && cd ../..

echo "[post-merge] Done."
