#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
dw_preflight

readonly DB_NAME="$(dw_read_env POSTGRES_DB)"
readonly DB_USER="$(dw_read_env POSTGRES_USER)"
readonly BACKUP_DIR="${DW_BACKUP_ROOT}/${DW_ENVIRONMENT}"
readonly TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
readonly PARTIAL_FILE="${BACKUP_FILE}.partial"

cleanup() {
  rm -f -- "${PARTIAL_FILE}"
}
trap cleanup EXIT

install -d -m 0750 "${BACKUP_DIR}"

dw_compose exec --no-TTY postgres \
  pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null \
  || dw_fail "PostgreSQL is not ready"

printf 'Creating %s database backup...\n' "${DW_ENVIRONMENT}"
dw_compose exec --no-TTY postgres \
  pg_dump \
  --username "${DB_USER}" \
  --dbname "${DB_NAME}" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges > "${PARTIAL_FILE}"

[[ -s "${PARTIAL_FILE}" ]] || dw_fail "pg_dump produced an empty backup"
dw_compose exec --no-TTY postgres pg_restore --list < "${PARTIAL_FILE}" >/dev/null \
  || dw_fail "PostgreSQL could not read the backup archive"

mv -- "${PARTIAL_FILE}" "${BACKUP_FILE}"
chmod 0600 "${BACKUP_FILE}"

readonly CHECKSUM="$(sha256sum "${BACKUP_FILE}" | awk '{ print $1 }')"
printf '%s  %s\n' "${CHECKSUM}" "$(basename -- "${BACKUP_FILE}")" > "${BACKUP_FILE}.sha256"
chmod 0600 "${BACKUP_FILE}.sha256"

trap - EXIT
printf 'Backup verified: %s\n' "${BACKUP_FILE}"
