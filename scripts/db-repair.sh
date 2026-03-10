#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_CONTAINER="${DB_CONTAINER:-deliveryways-postgres}"
DB_USER="${DB_USER:-deliveryways}"
DB_PASSWORD="${DB_PASSWORD:-deliveryways}"
DB_NAME="${DB_NAME:-deliveryways}"
DB_PORT="${DB_PORT:-5434}"
DB_HOST="${DB_HOST:-127.0.0.1}"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "❌ Container '$DB_CONTAINER' is not running"
  echo "Run: docker compose up -d postgres"
  exit 1
fi

echo "🔧 Repairing postgres role/database inside $DB_CONTAINER ..."
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
SQL

DB_EXISTS="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
if [[ "$DB_EXISTS" != "1" ]]; then
  echo "🔧 Creating database: $DB_NAME"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
else
  echo "ℹ️ Database already exists: $DB_NAME"
fi

echo "🔧 Updating DATABASE_URL in .env ..."
if [[ ! -f .env ]]; then
  touch .env
fi

NEW_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
if grep -q '^DATABASE_URL=' .env; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_URL}|" .env
else
  echo "DATABASE_URL=${NEW_URL}" >> .env
fi

echo "🔎 Verifying connectivity ..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "select 1;" >/dev/null; then
  echo "✅ DB repair complete"
  echo "✅ .env DATABASE_URL=${NEW_URL}"
else
  echo "❌ Verification failed"
  exit 1
fi
