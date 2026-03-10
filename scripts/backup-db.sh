#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_CONTAINER="${DB_CONTAINER:-deliveryways-postgres}"
DB_USER="${DB_USER:-deliveryways}"
DB_NAME="${DB_NAME:-deliveryways}"
BACKUP_DIR="${BACKUP_DIR:-backups/db}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%F_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "❌ Container '$DB_CONTAINER' is not running"
  exit 1
fi

echo "💾 Creating backup: $BACKUP_FILE"
docker exec -i "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges > "$BACKUP_FILE"

echo "✅ Backup completed: $BACKUP_FILE"
