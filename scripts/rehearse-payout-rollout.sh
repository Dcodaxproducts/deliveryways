#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for command_name in docker psql npm; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required command: $command_name" >&2
    exit 1
  }
done

container_name="feastflow-payout-rollout-$PPID-$$"
database_name="feastflow_payout_rollout_acceptance"
database_password="rehearsal-only"

gate_failure_log="$(mktemp)"
migration_workspace="$(mktemp -d "$ROOT_DIR/.payout-rollout-upgrade.XXXXXX")"

cleanup() {
  rm -f "$gate_failure_log"
  rm -rf "$migration_workspace"
  docker rm --force "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "$container_name" \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_DB="$database_name" \
  --publish 127.0.0.1::5432 \
  postgres:16 >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready \
    --username postgres --dbname "$database_name" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container_name" pg_isready \
  --username postgres --dbname "$database_name" >/dev/null

database_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR == 1 { print $NF }')"
export DATABASE_URL="postgresql://postgres:${database_password}@127.0.0.1:${database_port}/${database_name}"

mkdir -p "$migration_workspace/migrations"
cp prisma/migrations/migration_lock.toml "$migration_workspace/migrations/"
for migration_path in prisma/migrations/*/; do
  migration_name="$(basename "$migration_path")"
  if [[ "$migration_name" < '20261014170000_add_payout_integrity_lifecycle' ]]; then
    cp -R "$migration_path" "$migration_workspace/migrations/"
  fi
done
cat >"$migration_workspace/prisma.config.ts" <<EOF
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export default defineConfig({
  schema: '$ROOT_DIR/prisma/schema.prisma',
  migrations: { path: '$migration_workspace/migrations' },
  datasource: { url: databaseUrl },
});
EOF

echo '1/7 Apply the pre-rollout migration history to fresh PostgreSQL'
npx prisma migrate deploy --config "$migration_workspace/prisma.config.ts"

echo '2/7 Seed legacy upgrade fixtures'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/seed-payout-integrity-upgrade-rehearsal.sql

echo '3/7 Apply the remaining migrations only (no concurrent scripts)'
npx prisma migrate deploy

echo '4/7 Prove the predeploy gate rejects migrations-only upgrade state'
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/verify-payout-indexes-predeploy.sql >"$gate_failure_log" 2>&1; then
  echo 'Expected the migrations-only predeploy check to fail, but it passed' >&2
  exit 1
fi
if ! grep -Eq 'obsolete unique index|required indexes are absent' \
  "$gate_failure_log"; then
  cat "$gate_failure_log" >&2
  echo 'Predeploy check failed for an unexpected reason' >&2
  exit 1
fi
cat "$gate_failure_log"
echo 'Expected failure observed: application enablement remains blocked'

echo '5/7 Build required online indexes outside a transaction'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/create-payout-indexes-concurrently.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/create-payout-integrity-indexes-concurrently.sql

echo '6/7 Prove the predeploy gate accepts the prepared database'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/verify-payout-indexes-predeploy.sql

echo '7/7 Run the payout P0 suite against the prepared disposable database'
npm run test:p0 -- --runTestsByPath test/p0-payout-integrity.e2e-spec.ts

echo 'Payout rollout rehearsal passed'
