#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
readonly BACKUP_FILE="${3:-}"

[[ -n "${BACKUP_FILE}" ]] || dw_fail "usage: $0 <staging|production> <env-file> <backup-file>"

dw_preflight
dw_verify_backup "${BACKUP_FILE}"

readonly VERIFY_CONTAINER="deliveryway-restore-${DW_ENVIRONMENT}-$$"

cleanup() {
  docker rm --force "${VERIFY_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf 'Starting disposable PostgreSQL 16 restore target...\n'
docker run \
  --detach \
  --rm \
  --name "${VERIFY_CONTAINER}" \
  --network none \
  --env POSTGRES_PASSWORD=restore-verification-only \
  --env POSTGRES_DB=restore_verify \
  postgres:16-bookworm >/dev/null

ready_checks=0
for _ in $(seq 1 45); do
  if docker exec "${VERIFY_CONTAINER}" pg_isready --username postgres --dbname restore_verify >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if [[ "${ready_checks}" -ge 2 ]]; then
      break
    fi
  else
    ready_checks=0
  fi
  sleep 1
done

[[ "${ready_checks}" -ge 2 ]] || dw_fail "disposable restore database did not become stably ready"

docker exec --interactive "${VERIFY_CONTAINER}" \
  pg_restore \
  --username postgres \
  --dbname restore_verify \
  --no-owner \
  --no-privileges \
  --exit-on-error < "${BACKUP_FILE}"

readonly TABLE_COUNT="$(docker exec "${VERIFY_CONTAINER}" \
  psql --username postgres --dbname restore_verify --tuples-only --no-align \
  --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"

printf 'Restore verified in disposable database (%s public tables).\n' "${TABLE_COUNT}"
