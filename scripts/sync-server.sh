#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="${APP_NAME:-deliveryways-server}"
BRANCH="${BRANCH:-develop}"

echo "🚀 Syncing server from branch: $BRANCH"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  echo "✅ PM2 restarted: $APP_NAME"
else
  echo "⚠️ pm2 not found; skipped restart"
fi

echo "✅ Server sync complete"
