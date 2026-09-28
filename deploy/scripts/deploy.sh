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

readonly APP_SERVICES=(api restaurant-admin superadmin customer landing)
readonly PULL_SERVICES=(postgres migration "${APP_SERVICES[@]}")

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

printf 'Starting application services and waiting for health...\n'
if [[ "${USE_LOCAL_RELEASE_IMAGES:-no}" == "yes" ]]; then
  dw_compose up --detach --no-build --no-deps --wait "${release_app_services[@]}"
  [[ "${POSTGRES_CONTAINER_BEFORE}" == "$(dw_compose ps -q postgres)" ]] \
    || dw_fail "PostgreSQL container changed during local image deployment"
  dw_verify_running_release_images
else
  dw_compose up --detach --no-build --wait "${APP_SERVICES[@]}"
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
