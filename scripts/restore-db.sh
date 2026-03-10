#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_CONTAINER="${DB_CONTAINER:-deliveryways-postgres}"
DB_USER="${DB_USER:-deliveryways}"
DB_NAME="${DB_NAME:-deliveryways}"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/restore-db.sh <backup-file.sql>"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [[ "${FORCE_RESTORE:-no}" != "yes" ]]; then
  echo "❌ Restore is destructive. Re-run with FORCE_RESTORE=yes"
  echo "Example: FORCE_RESTORE=yes bash scripts/restore-db.sh $BACKUP_FILE"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "❌ Container '$DB_CONTAINER' is not running"
  exit 1
fi

echo "♻️ Restoring database '$DB_NAME' from: $BACKUP_FILE"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$BACKUP_FILE"

echo "✅ Restore completed"
