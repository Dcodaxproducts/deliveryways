#!/usr/bin/env bash

ff_fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ff_init() {
  FF_ENVIRONMENT="${1:-}"

  case "${FF_ENVIRONMENT}" in
    staging)
      FF_PROJECT_NAME="feastflow-staging"
      FF_OVERRIDE_FILE="${FF_DEPLOY_DIR}/compose.staging.yml"
      ;;
    production)
      FF_PROJECT_NAME="feastflow-prod"
      FF_OVERRIDE_FILE="${FF_DEPLOY_DIR}/compose.production.yml"
      ;;
    *)
      ff_fail "environment must be staging or production"
      ;;
  esac

  FF_ENV_FILE="${2:-/opt/feastflow/env/.env.${FF_ENVIRONMENT}}"
  FF_COMPOSE_FILE="${FF_DEPLOY_DIR}/compose.yml"
  FF_BACKUP_ROOT="${FEASTFLOW_BACKUP_ROOT:-/opt/feastflow/backups}"
  FF_RELEASE_ROOT="${FEASTFLOW_RELEASE_ROOT:-/opt/feastflow/releases}"
}

ff_read_env() {
  local key="$1"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count != 1) exit 2
    }
  ' "${FF_ENV_FILE}"
}

ff_compose() {
  docker compose \
    --project-name "${FF_PROJECT_NAME}" \
    --env-file "${FF_ENV_FILE}" \
    --file "${FF_COMPOSE_FILE}" \
    --file "${FF_OVERRIDE_FILE}" \
    "$@"
}

ff_preflight() {
  "${FF_DEPLOY_DIR}/scripts/preflight.sh" "${FF_ENVIRONMENT}" "${FF_ENV_FILE}"
}

ff_verify_backup() {
  local backup_file="$1"
  local checksum_file="${backup_file}.sha256"
  local expected_checksum
  local actual_checksum

  [[ -f "${backup_file}" ]] || ff_fail "backup not found: ${backup_file}"
  [[ -s "${backup_file}" ]] || ff_fail "backup is empty: ${backup_file}"
  [[ -f "${checksum_file}" ]] || ff_fail "backup checksum not found: ${checksum_file}"

  expected_checksum="$(awk 'NR == 1 { print $1 }' "${checksum_file}")"
  actual_checksum="$(sha256sum "${backup_file}" | awk '{ print $1 }')"
  [[ -n "${expected_checksum}" && "${expected_checksum}" == "${actual_checksum}" ]] \
    || ff_fail "backup checksum verification failed"
}

ff_image_keys() {
  printf '%s\n' \
    API_IMAGE \
    MIGRATION_IMAGE \
    RESTAURANT_ADMIN_IMAGE \
    SUPERADMIN_IMAGE \
    CUSTOMER_IMAGE \
    LANDING_IMAGE
}

ff_is_immutable_image() {
  [[ "$1" =~ (@sha256:[a-f0-9]{64}|:[a-f0-9]{7,40})$ ]]
}
