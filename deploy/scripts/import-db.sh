#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
readonly BACKUP_FILE="${3:-}"

[[ "${DW_ENVIRONMENT}" == "development" ]] \
  || dw_fail "legacy database import is allowed only for development"
[[ -n "${BACKUP_FILE}" ]] \
  || dw_fail "usage: $0 development <env-file> <backup-file>"

dw_preflight
dw_verify_backup "${BACKUP_FILE}"

readonly DB_NAME="$(dw_read_env POSTGRES_DB)"
readonly DB_USER="$(dw_read_env POSTGRES_USER)"

printf 'Starting isolated development PostgreSQL...\n'
dw_compose up --detach --no-build --wait postgres

dw_compose exec --no-TTY postgres \
  pg_isready --username "${DB_USER}" --dbname "${DB_NAME}" >/dev/null \
  || dw_fail "PostgreSQL is not ready"
dw_compose exec --no-TTY postgres pg_restore --list < "${BACKUP_FILE}" >/dev/null \
  || dw_fail "PostgreSQL could not read the backup archive"

readonly EXISTING_TABLE_COUNT="$(dw_compose exec --no-TTY postgres \
  psql --username "${DB_USER}" --dbname "${DB_NAME}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"

[[ "${EXISTING_TABLE_COUNT}" == "0" ]] \
  || dw_fail "development database is not empty (${EXISTING_TABLE_COUNT} public tables); import refused"

printf 'Restoring verified legacy backup in a single transaction...\n'
dw_compose exec --interactive postgres \
  pg_restore \
  --username "${DB_USER}" \
  --dbname "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error < "${BACKUP_FILE}"

printf 'Applying committed migrations after restore...\n'
dw_compose --profile tools run --rm --no-deps migration

readonly RESTORED_TABLE_COUNT="$(dw_compose exec --no-TTY postgres \
  psql --username "${DB_USER}" --dbname "${DB_NAME}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"

[[ "${RESTORED_TABLE_COUNT}" -gt 0 ]] || dw_fail "restored database has no public tables"
printf 'Development import completed (%s public tables).\n' "${RESTORED_TABLE_COUNT}"
