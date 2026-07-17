#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
readonly BACKUP_FILE="${3:-}"

[[ -n "${BACKUP_FILE}" ]] || dw_fail "usage: $0 <development|staging|production> <env-file> <backup-file>"

dw_preflight
dw_verify_backup "${BACKUP_FILE}"

readonly DB_NAME="$(dw_read_env POSTGRES_DB)"
readonly DB_USER="$(dw_read_env POSTGRES_USER)"

dw_compose exec --no-TTY postgres \
  pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null \
  || dw_fail "PostgreSQL is not ready"
dw_compose exec --no-TTY postgres pg_restore --list < "${BACKUP_FILE}" >/dev/null \
  || dw_fail "PostgreSQL could not read the backup archive"

printf 'Applying committed Prisma migrations to %s...\n' "${DW_ENVIRONMENT}"
dw_compose --profile tools run --rm --no-deps migration
printf 'Migration completed after verified backup: %s\n' "${BACKUP_FILE}"
