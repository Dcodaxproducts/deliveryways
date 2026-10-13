#!/usr/bin/env bash
# Rolls application services back to a recorded release manifest. The database is never touched,
# except by the explicit legacy "drop-migration" mode below.
#
# Manifest shapes:
#   current  - lists REALTIME_IMAGE. Clients, realtime and API are restored (in that order).
#   legacy   - pre-feature manifest WITHOUT REALTIME_IMAGE (API/MIGRATION/client images only). The old
#              images have no dispatcher, but the outbox triggers installed by migration
#              20261013003000 keep enqueuing rows on every order/chat write. Because that is a
#              database decision, the operator must choose it explicitly:
#                LEGACY_ROLLBACK_OUTBOX=retain-triggers  keep the current realtime container running as
#                                                        the dispatcher (ingress stays closed), old
#                                                        clients/API are restored; outbox keeps draining.
#                LEGACY_ROLLBACK_OUTBOX=drop-migration   after a verified backup and a drained outbox,
#                                                        run rollback.sql in one locked transaction,
#                                                        then stop and remove the realtime container.
#              Both require REALTIME_INGRESS_DISABLED=yes: the operator has already removed the
#              /socket.io ingress route (sockets answer 503, clients poll). OUTBOX_DISCARD_APPROVED=yes
#              lets drop-migration discard rows that are still pending.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
readonly RELEASE_FILE="${3:-}"

[[ -n "${RELEASE_FILE}" ]] || dw_fail "usage: $0 <staging|production> <env-file> <release-manifest>"
[[ -f "${RELEASE_FILE}" ]] || dw_fail "release manifest not found: ${RELEASE_FILE}"

if [[ "${DW_ENVIRONMENT}" == "production" && "${PRODUCTION_ROLLBACK_APPROVED:-}" != "yes" ]]; then
  dw_fail "production requires PRODUCTION_ROLLBACK_APPROVED=yes"
fi
if [[ "${DW_ENVIRONMENT}" == "production" && "${SKIP_IMAGE_PULL:-}" == "yes" ]]; then
  dw_fail "production image pulls cannot be skipped"
fi

dw_preflight

legacy_manifest=no
while IFS= read -r key; do
  if [[ "${key}" == "REALTIME_IMAGE" ]] \
    && ! grep -q '^REALTIME_IMAGE=' "${RELEASE_FILE}"; then
    legacy_manifest=yes
    continue
  fi
  value="$(dw_manifest_value "${RELEASE_FILE}" "${key}")" \
    || dw_fail "${key} must appear exactly once in the release manifest"
  dw_is_immutable_image "${value}" || dw_fail "${key} is not an immutable image reference"
  printf -v "${key}" '%s' "${value}"
  export "${key}"
done < <(dw_image_keys)

readonly CLIENT_SERVICES=(restaurant-admin superadmin customer landing)

roll_back_services() {
  local service

  if [[ "${SKIP_IMAGE_PULL:-}" != "yes" ]]; then
    dw_compose pull "$@"
  fi
  # Reverse of the deploy order: clients first, then realtime, then the API.
  for service in "${CLIENT_SERVICES[@]}" realtime api; do
    [[ " $* " == *" ${service} "* ]] || continue
    dw_compose up --detach --no-build --no-deps --wait "${service}"
  done
}

record_release() {
  local release_dir="${DW_RELEASE_ROOT}/${DW_ENVIRONMENT}"

  install -d -m 0750 "${release_dir}"
  ln -sfn "$(realpath --relative-to="${release_dir}" "${RELEASE_FILE}")" "${release_dir}/current.env"
  printf 'Rollback completed to: %s\n' "${RELEASE_FILE}"
}

if [[ "${legacy_manifest}" == "no" ]]; then
  printf 'Rolling application services back; database and volume are unchanged...\n'
  roll_back_services api realtime "${CLIENT_SERVICES[@]}"
  "${SCRIPT_DIR}/smoke-test.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"
  record_release
  printf 'Database rollback was not attempted.\n'
  exit 0
fi

printf 'Legacy release manifest (no REALTIME_IMAGE): this release has no realtime gateway or dispatcher.\n'
[[ "${REALTIME_INGRESS_DISABLED:-}" == "yes" ]] \
  || dw_fail "remove the /socket.io ingress route first (sockets must answer 503 so clients poll), then re-run with REALTIME_INGRESS_DISABLED=yes"
readonly OUTBOX_MODE="${LEGACY_ROLLBACK_OUTBOX:-}"
case "${OUTBOX_MODE}" in
  retain-triggers | drop-migration) ;;
  *)
    dw_fail "legacy manifest needs LEGACY_ROLLBACK_OUTBOX=retain-triggers (keep the current realtime container as dispatcher) or drop-migration (roll the outbox migration back after the queue drains)"
    ;;
esac

readonly LEGACY_SERVICES=(api "${CLIENT_SERVICES[@]}")

if [[ "${OUTBOX_MODE}" == "retain-triggers" ]]; then
  # Triggers keep writing outbox rows; the current realtime image is the only compatible dispatcher.
  dw_verify_running_healthy realtime
  printf 'Restoring legacy API and clients; the current realtime container stays up as the outbox dispatcher...\n'
  roll_back_services "${LEGACY_SERVICES[@]}"
  SMOKE_REALTIME=yes "${SCRIPT_DIR}/smoke-test.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"
  record_release
  printf 'Outbox triggers remain installed and realtime keeps draining them; ingress stays closed.\n'
  printf 'Database rollback was not attempted.\n'
  exit 0
fi

# drop-migration: services first (a failure below then leaves the safe retain-triggers state), database
# second, and only after the triggers are gone is the dispatcher removed.
dw_verify_running_postgres >/dev/null
dw_verify_running_healthy realtime
backup_output="$(env DELIVERYWAY_BACKUP_ROOT="${DW_BACKUP_ROOT}" \
  "${SCRIPT_DIR}/backup-db.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}")"
printf '%s\n' "${backup_output}"
backup_file="$(printf '%s\n' "${backup_output}" | sed -n 's/^Backup verified: //p' | tail -n 1)"
[[ -n "${backup_file}" ]] || dw_fail "backup script did not return a verified backup path"

printf 'Restoring legacy API and clients while realtime keeps draining the outbox...\n'
roll_back_services "${LEGACY_SERVICES[@]}"

readonly ROLLBACK_SQL="${DW_DEPLOY_DIR}/../prisma/migrations/${DW_OUTBOX_MIGRATION}/rollback.sql"
[[ -f "${ROLLBACK_SQL}" ]] || dw_fail "outbox rollback SQL not found: ${ROLLBACK_SQL}"

if [[ "${OUTBOX_DISCARD_APPROVED:-}" == "yes" ]]; then
  printf 'OUTBOX_DISCARD_APPROVED=yes: pending outbox rows will be discarded (backup: %s).\n' "${backup_file}"
  pending_check=''
else
  # The dispatcher must be able to read orders/chat while it drains, so wait BEFORE taking table locks.
  dw_wait_outbox_drained "${OUTBOX_DRAIN_TIMEOUT_SECONDS:-120}" \
    || dw_fail "realtime outbox did not drain; fix the dispatcher or set OUTBOX_DISCARD_APPROVED=yes to discard pending rows"
  pending_check="DO \$check\$ BEGIN IF EXISTS (SELECT 1 FROM realtime_outbox_events WHERE published_at IS NULL) THEN RAISE EXCEPTION 'realtime outbox is not drained'; END IF; END \$check\$;"
fi

# One transaction: lock the writers out of the three trigger tables, re-check the backlog under the lock,
# drop everything, and forget the migration so a later migrate deploy can re-apply it cleanly.
printf 'Rolling the realtime outbox migration back in one locked transaction...\n'
{
  printf "BEGIN;\nSET LOCAL lock_timeout = '30s';\n"
  printf 'LOCK TABLE orders, chat_threads, chat_messages IN ACCESS EXCLUSIVE MODE;\n'
  printf '%s\n' "${pending_check}"
  cat "${ROLLBACK_SQL}"
  printf "DELETE FROM _prisma_migrations WHERE migration_name = '%s';\nCOMMIT;\n" "${DW_OUTBOX_MIGRATION}"
} | dw_psql >/dev/null \
  || dw_fail "outbox migration rollback failed and was not applied; legacy API/clients are running with triggers retained and the dispatcher up"

printf 'Triggers removed; stopping and removing the realtime container...\n'
dw_compose stop realtime
dw_compose rm --force realtime
SMOKE_REALTIME=no "${SCRIPT_DIR}/smoke-test.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"
record_release
printf 'Outbox migration rolled back and realtime removed; pre-rollback backup: %s\n' "${backup_file}"
