#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="${APP_NAME:-feastflow-server}"
BRANCH="${BRANCH:-develop}"

if [[ "${SKIP_PULL:-no}" != "yes" ]]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
fi

npm install
command -v psql >/dev/null
npm run db:doctor
npm run db:backup
npm run prisma:generate
npx prisma validate
npm run build

# Database rollout barrier: application processes must not be restarted before
# this entire block succeeds. CONCURRENTLY statements must remain outside an
# explicit transaction.
npm run prisma:migrate:deploy
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/create-payout-indexes-concurrently.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/create-payout-integrity-indexes-concurrently.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/verify-payout-indexes-predeploy.sql

# One bounded, restartable batch plus a read-only audit. Operators may repeat
# bounded batches before enablement; unsafe legacy rows stay quarantined.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v batch_size=500 \
  -f scripts/backfill-payout-integrity.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/audit-payout-integrity-rollout.sql

pm2 restart "$APP_NAME" --update-env

echo "✅ Safe deploy completed"
