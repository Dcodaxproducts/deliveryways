#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "❌ .env not found in $ROOT_DIR"
  exit 1
fi

DATABASE_URL_LINE="$(grep '^DATABASE_URL=' .env || true)"
if [[ -z "$DATABASE_URL_LINE" ]]; then
  echo "❌ DATABASE_URL is missing in .env"
  exit 1
fi

DATABASE_URL="${DATABASE_URL_LINE#DATABASE_URL=}"
export DATABASE_URL

echo "🔎 DATABASE_URL from .env: $DATABASE_URL"

printf "\n🔎 Docker postgres container status\n"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "deliveryways-postgres|NAMES" || {
  echo "❌ deliveryways-postgres container is not running"
  exit 1
}

printf "\n🔎 Databases inside deliveryways-postgres\n"
docker exec deliveryways-postgres psql -U postgres -d postgres -c "\\l" || {
  echo "❌ Could not list databases from container"
  exit 1
}

printf "\n🔎 TCP auth check against DATABASE_URL\n"

# Raw connectivity/auth check (same path prisma uses)
if psql "$DATABASE_URL" -c "select current_database(), current_user, now();" >/dev/null 2>&1; then
  echo "✅ DATABASE_URL connectivity/auth is valid"
else
  echo "❌ DATABASE_URL connectivity/auth failed"
  echo "   Run: npm run db:repair"
  exit 1
fi

printf "\n✅ DB doctor passed\n"
