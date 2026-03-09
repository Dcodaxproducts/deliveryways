#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="${APP_NAME:-deliveryways-server}"
BRANCH="${BRANCH:-develop}"

if [[ "${SKIP_PULL:-no}" != "yes" ]]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
fi

npm install
npm run db:doctor
npm run db:backup
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
pm2 restart "$APP_NAME" --update-env

echo "✅ Safe deploy completed"
