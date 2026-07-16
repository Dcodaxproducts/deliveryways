#!/usr/bin/env bash

dw_fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

dw_init() {
  DW_ENVIRONMENT="${1:-}"

  case "${DW_ENVIRONMENT}" in
    staging)
      DW_PROJECT_NAME="deliveryway-staging"
      DW_OVERRIDE_FILE="${DW_DEPLOY_DIR}/compose.staging.yml"
      ;;
    production)
      DW_PROJECT_NAME="deliveryway-prod"
      DW_OVERRIDE_FILE="${DW_DEPLOY_DIR}/compose.production.yml"
      ;;
    *)
      dw_fail "environment must be staging or production"
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
