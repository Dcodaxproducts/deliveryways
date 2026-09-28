#!/usr/bin/env bash

dw_fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

dw_init() {
  DW_ENVIRONMENT="${1:-}"

  case "${DW_ENVIRONMENT}" in
    development)
      DW_PROJECT_NAME="deliveryway-development"
      DW_OVERRIDE_FILE="${DW_DEPLOY_DIR}/compose.development.yml"
      ;;
    staging)
      DW_PROJECT_NAME="deliveryway-staging"
      DW_OVERRIDE_FILE="${DW_DEPLOY_DIR}/compose.staging.yml"
      ;;
    production)
      DW_PROJECT_NAME="deliveryway-prod"
      DW_OVERRIDE_FILE="${DW_DEPLOY_DIR}/compose.production.yml"
      ;;
    *)
      dw_fail "environment must be development, staging, or production"
      ;;
  esac

  DW_ENV_FILE="${2:-/opt/deliveryway/env/.env.${DW_ENVIRONMENT}}"
  DW_COMPOSE_FILE="${DW_DEPLOY_DIR}/compose.yml"
  DW_BACKUP_ROOT="${DELIVERYWAY_BACKUP_ROOT:-/opt/deliveryway/backups}"
  DW_RELEASE_ROOT="${DELIVERYWAY_RELEASE_ROOT:-/opt/deliveryway/releases}"
}

dw_read_env() {
  local key="$1"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count != 1) exit 2
    }
  ' "${DW_ENV_FILE}"
}

dw_compose() {
  docker compose \
    --project-name "${DW_PROJECT_NAME}" \
    --env-file "${DW_ENV_FILE}" \
    --file "${DW_COMPOSE_FILE}" \
    --file "${DW_OVERRIDE_FILE}" \
    "$@"
}

dw_preflight() {
  "${DW_DEPLOY_DIR}/scripts/preflight.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"
}

dw_verify_backup() {
  local backup_file="$1"
  local checksum_file="${backup_file}.sha256"
  local expected_checksum
  local actual_checksum

  [[ -f "${backup_file}" ]] || dw_fail "backup not found: ${backup_file}"
  [[ -s "${backup_file}" ]] || dw_fail "backup is empty: ${backup_file}"
  [[ -f "${checksum_file}" ]] || dw_fail "backup checksum not found: ${checksum_file}"

  expected_checksum="$(awk 'NR == 1 { print $1 }' "${checksum_file}")"
  actual_checksum="$(sha256sum "${backup_file}" | awk '{ print $1 }')"
  [[ -n "${expected_checksum}" && "${expected_checksum}" == "${actual_checksum}" ]] \
    || dw_fail "backup checksum verification failed"
}

dw_image_keys() {
  printf '%s\n' \
    API_IMAGE \
    MIGRATION_IMAGE \
    RESTAURANT_ADMIN_IMAGE \
    SUPERADMIN_IMAGE \
    CUSTOMER_IMAGE \
    LANDING_IMAGE
}

dw_is_immutable_image() {
  [[ "$1" =~ (@sha256:[a-f0-9]{64}|:[a-f0-9]{7,40})$ ]]
}

dw_manifest_value() {
  local manifest_file="$1"
  local key="$2"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count != 1) exit 2
    }
  ' "${manifest_file}"
}

dw_image_key_for_service() {
  case "$1" in
    api) printf '%s\n' API_IMAGE ;;
    migration) printf '%s\n' MIGRATION_IMAGE ;;
    restaurant-admin) printf '%s\n' RESTAURANT_ADMIN_IMAGE ;;
    superadmin) printf '%s\n' SUPERADMIN_IMAGE ;;
    customer) printf '%s\n' CUSTOMER_IMAGE ;;
    landing) printf '%s\n' LANDING_IMAGE ;;
    *) dw_fail "unsupported release service: $1" ;;
  esac
}

dw_validate_manifest_file() {
  local manifest_file="$1"
  local expected_dir="$2"
  local description="$3"
  local canonical_file
  local canonical_dir

  [[ -f "${manifest_file}" && -r "${manifest_file}" && ! -L "${manifest_file}" ]] \
    || dw_fail "${description} is missing, unreadable, or a symlink"
  canonical_file="$(realpath -e "${manifest_file}")"
  canonical_dir="$(realpath -e "${expected_dir}")"
  [[ "$(dirname -- "${canonical_file}")" == "${canonical_dir}" ]] \
    || dw_fail "${description} must be stored directly under ${canonical_dir}"
  [[ "$(stat -c '%U' "${canonical_file}")" == "root" ]] \
    || dw_fail "${description} must be owned by root"
  case "$(stat -c '%a' "${canonical_file}")" in
    600 | 640) ;;
    *) dw_fail "${description} mode must be 600 or 640" ;;
  esac
  printf '%s\n' "${canonical_file}"
}

dw_verify_local_release_approval() {
  local approval_file="${LOCAL_RELEASE_APPROVAL_FILE:-}"
  local services="${LOCAL_RELEASE_SERVICES:-}"
  local service
  local key
  local expected_image
  local approved_image
  local approved_id
  local actual_id

  local migration_approved=no

  [[ -n "${approval_file}" ]] || dw_fail "LOCAL_RELEASE_APPROVAL_FILE is required"
  [[ -n "${services}" ]] || dw_fail "LOCAL_RELEASE_SERVICES is required"
  approval_file="$(dw_validate_manifest_file \
    "${approval_file}" "${DW_RELEASE_ROOT}/approvals/production" \
    'local release approval')"

  IFS=',' read -r -a release_services <<<"${services}"
  for service in "${release_services[@]}"; do
    [[ "${service}" == "migration" ]] && migration_approved=yes
    key="$(dw_image_key_for_service "${service}")"
    expected_image="$(dw_read_env "${key}")"
    approved_image="$(dw_manifest_value "${approval_file}" "${key}")" \
      || dw_fail "approval must contain exactly one ${key}"
    approved_id="$(dw_manifest_value "${approval_file}" "${key}_ID")" \
      || dw_fail "approval must contain exactly one ${key}_ID"
    [[ "${approved_image}" == "${expected_image}" ]] \
      || dw_fail "approved image does not match ${key}"
    actual_id="$(docker image inspect --format '{{.Id}}' "${expected_image}" 2>/dev/null)" \
      || dw_fail "required approved local image not found: ${expected_image}"
    [[ "${actual_id}" == "${approved_id}" ]] \
      || dw_fail "local image ID does not match approval: ${expected_image}"
    printf '  OK  approved local image %s (%s)\n' "${expected_image}" "${actual_id}"
  done
  [[ "${migration_approved}" == "yes" ]] \
    || dw_fail "local Production release must approve the migration service"
}

dw_verify_running_postgres() {
  local container_id
  local running
  local health

  container_id="$(dw_compose ps -q postgres)"
  [[ -n "${container_id}" ]] || dw_fail "PostgreSQL container is not running"
  running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${container_id}")"
  [[ "${running}" == "true" ]] || dw_fail "PostgreSQL container is not running"
  [[ "${health}" == "healthy" ]] || dw_fail "PostgreSQL container is not healthy"
  printf '%s\n' "${container_id}"
}

dw_verify_running_release_images() {
  local services="${LOCAL_RELEASE_SERVICES}"
  local approval_file="${LOCAL_RELEASE_APPROVAL_FILE}"
  local service
  local key
  local approved_id
  local container_id
  local running_id

  IFS=',' read -r -a release_services <<<"${services}"
  for service in "${release_services[@]}"; do
    [[ "${service}" == "migration" ]] && continue
    key="$(dw_image_key_for_service "${service}")"
    approved_id="$(dw_manifest_value "${approval_file}" "${key}_ID")"
    container_id="$(dw_compose ps -q "${service}")"
    [[ -n "${container_id}" ]] || dw_fail "released service is not running: ${service}"
    running_id="$(docker inspect --format '{{.Image}}' "${container_id}")"
    [[ "${running_id}" == "${approved_id}" ]] \
      || dw_fail "running image does not match approval: ${service}"
  done
}
