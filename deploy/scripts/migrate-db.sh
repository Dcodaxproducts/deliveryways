#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly FF_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

ff_init "${1:-}" "${2:-}"
readonly BACKUP_FILE="${3:-}"

[[ -n "${BACKUP_FILE}" ]] || ff_fail "usage: $0 <staging|production> <env-file> <backup-file>"

ff_preflight
ff_verify_backup "${BACKUP_FILE}"

readonly DB_NAME="$(ff_read_env POSTGRES_DB)"
readonly DB_USER="$(ff_read_env POSTGRES_USER)"

ff_compose exec --no-TTY postgres \
  pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null \
  || ff_fail "PostgreSQL is not ready"
ff_compose exec --no-TTY postgres pg_restore --list < "${BACKUP_FILE}" >/dev/null \
  || ff_fail "PostgreSQL could not read the backup archive"

printf 'Applying committed Prisma migrations to %s...\n' "${FF_ENVIRONMENT}"
ff_compose --profile tools run --rm --no-deps migration
printf 'Migration completed after verified backup: %s\n' "${BACKUP_FILE}"
