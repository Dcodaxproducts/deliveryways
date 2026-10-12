#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"

if [[ "${DW_ENVIRONMENT}" == "production" && "${PRODUCTION_DEPLOY_APPROVED:-}" != "yes" ]]; then
  dw_fail "production requires PRODUCTION_DEPLOY_APPROVED=yes"
fi
if [[ "${DW_ENVIRONMENT}" == "production" && "${SKIP_IMAGE_PULL:-}" == "yes" ]]; then
  dw_fail "production image pulls cannot be skipped"
fi
if [[ "${DW_ENVIRONMENT}" == "production" && "${SKIP_REALTIME_SOAK:-}" == "yes" ]]; then
  dw_fail "the production realtime soak cannot be skipped"
fi

case "${USE_LOCAL_RELEASE_IMAGES:-no}" in
  yes | no)
    ;;
  *)
    dw_fail "USE_LOCAL_RELEASE_IMAGES must be yes or no"
    ;;
esac

if [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" == "yes" ]]; then
  [[ "${DW_ENVIRONMENT}" == "production" ]] \
    || dw_fail "local release images are supported only for production"
  [[ "${PRODUCTION_LOCAL_IMAGES_APPROVED:-}" == "yes" ]] \
    || dw_fail "local production images require PRODUCTION_LOCAL_IMAGES_APPROVED=yes"
fi

dw_preflight

# Mandatory single-instance rollout order (docs/realtime-durable-rollout.md):
#   backup -> migration (outbox + triggers) -> API -> realtime gateway -> private soak -> clients.
# Socket ingress is switched on by hand after this script, last; until then sockets answer 503 and
# the existing clients keep polling.
readonly API_SERVICES=(api)
readonly REALTIME_SERVICES=(realtime)
readonly CLIENT_SERVICES=(restaurant-admin superadmin customer landing)
readonly APP_SERVICES=("${API_SERVICES[@]}" "${REALTIME_SERVICES[@]}" "${CLIENT_SERVICES[@]}")
readonly PULL_SERVICES=(postgres migration "${APP_SERVICES[@]}")

# True when this release deploys the given service (everything, unless a partial local release).
release_includes() {
  [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" != "yes" ]] \
    || [[ " ${release_app_services[*]} " == *" $1 "* ]]
}

deploy_phase() {
  local description="$1"
  local services=()
  local service
  local scale=()
  shift

  for service in "$@"; do
    release_includes "${service}" && services+=("${service}")
  done
  [[ "${#services[@]}" -gt 0 ]] || return 0
  # One realtime instance only: the advisory-lock dispatcher is safe with more, but the rollout is single-instance.
  [[ " ${services[*]} " == *" realtime "* ]] && scale=(--scale realtime=1)
  printf '%s\n' "${description}"
  dw_compose up --detach --no-build --no-deps --wait "${scale[@]}" "${services[@]}"
}

if [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" == "yes" ]]; then
  printf 'Using explicitly approved local immutable production images...\n'
  dw_verify_local_release_approval
  IFS=',' read -r -a local_release_services <<<"${LOCAL_RELEASE_SERVICES}"
  release_app_services=()
  for service in "${local_release_services[@]}"; do
    [[ "${service}" == "migration" ]] || release_app_services+=("${service}")
  done
  [[ "${#release_app_services[@]}" -gt 0 ]] \
    || dw_fail "local release must include at least one application service"
elif [[ "${SKIP_IMAGE_PULL:-}" != "yes" ]]; then
  printf 'Pulling immutable release images...\n'
  dw_compose --profile tools pull "${PULL_SERVICES[@]}"
else
  printf 'Skipping registry pull for controlled non-production verification.\n'
fi

if [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" == "yes" ]]; then
  printf 'Verifying the existing PostgreSQL container without pulling or recreating it...\n'
  readonly POSTGRES_CONTAINER_BEFORE="$(dw_verify_running_postgres)"
else
  printf 'Starting PostgreSQL and waiting for health...\n'
  dw_compose up --detach --no-build --wait postgres
fi

backup_output="$(env DELIVERYWAY_BACKUP_ROOT="${DW_BACKUP_ROOT}" \
  "${SCRIPT_DIR}/backup-db.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}")"
printf '%s\n' "${backup_output}"
backup_file="$(printf '%s\n' "${backup_output}" | sed -n 's/^Backup verified: //p' | tail -n 1)"
[[ -n "${backup_file}" ]] || dw_fail "backup script did not return a verified backup path"

"${SCRIPT_DIR}/migrate-db.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}" "${backup_file}"

deploy_phase 'Starting API (clients keep polling; socket ingress stays closed)...' "${API_SERVICES[@]}"

if release_includes realtime; then
  deploy_phase 'Starting the single realtime gateway/dispatcher instance...' "${REALTIME_SERVICES[@]}"
  if [[ "${SKIP_REALTIME_SOAK:-}" == "yes" ]]; then
    printf 'Skipping the private realtime soak for controlled non-production verification.\n'
  else
    "${SCRIPT_DIR}/realtime-soak.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"
  fi
fi

deploy_phase 'Switching client applications (only after the soak passed)...' "${CLIENT_SERVICES[@]}"

if [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" == "yes" ]]; then
  [[ "${POSTGRES_CONTAINER_BEFORE}" == "$(dw_compose ps -q postgres)" ]] \
    || dw_fail "PostgreSQL container changed during local image deployment"
  dw_verify_running_release_images
fi
"${SCRIPT_DIR}/smoke-test.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"

readonly RELEASE_DIR="${DW_RELEASE_ROOT}/${DW_ENVIRONMENT}"
readonly RELEASE_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly RELEASE_FILE="${RELEASE_DIR}/${RELEASE_TIMESTAMP}.env"
install -d -m 0750 "${RELEASE_DIR}"

{
  printf 'DEPLOYED_AT=%s\n' "${RELEASE_TIMESTAMP}"
  while IFS= read -r key; do
    printf '%s=%s\n' "${key}" "$(dw_read_env "${key}")"
  done < <(dw_image_keys)
} > "${RELEASE_FILE}"
chmod 0640 "${RELEASE_FILE}"
ln -sfn "$(basename -- "${RELEASE_FILE}")" "${RELEASE_DIR}/current.env"

printf 'Release deployed and recorded: %s\n' "${RELEASE_FILE}"
printf 'Final step (manual): route /socket.io on the ingress to the realtime port only after confirming\n'
printf 'the soak above passed. Roll back by removing that ingress route first.\n'
