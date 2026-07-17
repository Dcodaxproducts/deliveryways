#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

fail() {
  printf 'Development environment preparation failed: %s\n' "$1" >&2
  exit 1
}

readonly LEGACY_ENV="${1:-}"
readonly OUTPUT_ENV="${2:-/opt/deliveryway/env/.env.development}"
readonly SERVER_IPV4="${3:-}"
readonly BASE_DOMAIN="${4:-delivery-way.de}"
readonly SOURCE_ROOT="${5:-/opt/deliveryway/source}"
readonly OUTPUT_GROUP="${6:-deploy}"
readonly TEMPLATE="${SOURCE_ROOT}/deliveryways/deploy/env/.env.development.example"

[[ "$(id -u)" == "0" ]] || fail "run as root so the output remains root-owned"
[[ -f "${LEGACY_ENV}" && -r "${LEGACY_ENV}" ]] || fail "legacy env file is not readable"
[[ -f "${TEMPLATE}" ]] || fail "development env template not found"
[[ -n "${SERVER_IPV4}" ]] || fail "server IPv4 address is required"
[[ -f "${OUTPUT_ENV}" ]] || fail "protected development env template is not installed"
awk '!/^[[:space:]]*#/ && /REPLACE_WITH/ { found = 1 } END { exit !found }' "${OUTPUT_ENV}" \
  || fail "output is already prepared; refusing to replace it"

read_env() {
  local file="$1"
  local key="$2"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count != 1) exit 2
    }
  ' "${file}"
}

require_legacy() {
  local key="$1"
  local value

  value="$(read_env "${LEGACY_ENV}" "${key}")" \
    || fail "legacy ${key} must appear exactly once"
  [[ -n "${value}" ]] || fail "legacy ${key} is empty"
  printf '%s' "${value}"
}

repo_sha() {
  local directory="$1"

  git -C "${directory}" rev-parse --git-dir >/dev/null 2>&1 \
    || fail "Git repository not found: ${directory}"
  [[ -z "$(git -C "${directory}" status --short)" ]] \
    || fail "Git repository has local changes: ${directory}"
  git -C "${directory}" rev-parse --short=12 HEAD
}

set_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  local next_file="${file}.next"

  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 {
      if (found) exit 2
      print key "=" value
      found = 1
      next
    }
    { print }
    END { if (!found) exit 3 }
  ' "${file}" > "${next_file}" || {
    rm -f "${next_file}"
    fail "could not set ${key}"
  }
  mv "${next_file}" "${file}"
}

JWT_ACCESS_SECRET="$(require_legacy JWT_ACCESS_SECRET)"
JWT_REFRESH_SECRET="$(require_legacy JWT_REFRESH_SECRET)"
STRIPE_SECRET_KEY="$(require_legacy STRIPE_SECRET_KEY)"
STRIPE_PUBLISHABLE_KEY="$(require_legacy STRIPE_PUBLISHABLE_KEY)"
STRIPE_WEBHOOK_SECRET="$(require_legacy STRIPE_WEBHOOK_SECRET)"
readonly JWT_ACCESS_SECRET JWT_REFRESH_SECRET
readonly STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET

[[ "${STRIPE_SECRET_KEY}" == sk_test_* ]] \
  || fail "legacy Stripe secret key is not test mode"
[[ "${STRIPE_PUBLISHABLE_KEY}" == pk_test_* ]] \
  || fail "legacy Stripe publishable key is not test mode"

API_SHA="$(repo_sha "${SOURCE_ROOT}/deliveryways")"
RESTAURANT_ADMIN_SHA="$(repo_sha "${SOURCE_ROOT}/deliveryway-restaurant-admin")"
SUPERADMIN_SHA="$(repo_sha "${SOURCE_ROOT}/deliveryway-superadmin")"
CUSTOMER_SHA="$(repo_sha "${SOURCE_ROOT}/deliveryway-customer-website")"
LANDING_SHA="$(repo_sha "${SOURCE_ROOT}/Deliveryway-landing-page")"
DB_PASSWORD="$(openssl rand -hex 32)"
HOSTNAME_VALUE="$(hostname)"
WORK_FILE="$(mktemp "${OUTPUT_ENV}.prepare.XXXXXX")"
readonly API_SHA RESTAURANT_ADMIN_SHA SUPERADMIN_SHA CUSTOMER_SHA LANDING_SHA
readonly DB_PASSWORD HOSTNAME_VALUE WORK_FILE
trap 'rm -f "${WORK_FILE}" "${WORK_FILE}.next"' EXIT
cp "${TEMPLATE}" "${WORK_FILE}"

set_env "${WORK_FILE}" DELIVERYWAY_ENV_FILE "${OUTPUT_ENV}"
set_env "${WORK_FILE}" EXPECTED_HOSTNAME "${HOSTNAME_VALUE}"
set_env "${WORK_FILE}" EXPECTED_SERVER_IPV4 "${SERVER_IPV4}"
set_env "${WORK_FILE}" POSTGRES_PASSWORD "${DB_PASSWORD}"
set_env "${WORK_FILE}" DATABASE_URL "postgresql://deliveryway_development:${DB_PASSWORD}@postgres:5432/deliveryway_development"
set_env "${WORK_FILE}" API_IMAGE "deliveryway-development-api:${API_SHA}"
set_env "${WORK_FILE}" MIGRATION_IMAGE "deliveryway-development-migration:${API_SHA}"
set_env "${WORK_FILE}" RESTAURANT_ADMIN_IMAGE "deliveryway-development-restaurant-admin:${RESTAURANT_ADMIN_SHA}"
set_env "${WORK_FILE}" SUPERADMIN_IMAGE "deliveryway-development-superadmin:${SUPERADMIN_SHA}"
set_env "${WORK_FILE}" CUSTOMER_IMAGE "deliveryway-development-customer:${CUSTOMER_SHA}"
set_env "${WORK_FILE}" LANDING_IMAGE "deliveryway-development-landing:${LANDING_SHA}"
set_env "${WORK_FILE}" PUBLIC_API_ROOT_URL "https://api.dev.${BASE_DOMAIN}/api"
set_env "${WORK_FILE}" PUBLIC_API_BASE_URL "https://api.dev.${BASE_DOMAIN}/api/v1"
set_env "${WORK_FILE}" PUBLIC_RESTAURANT_ADMIN_URL "https://admin.dev.${BASE_DOMAIN}"
set_env "${WORK_FILE}" PUBLIC_CUSTOMER_URL "https://dev.${BASE_DOMAIN}"
set_env "${WORK_FILE}" CORS_ORIGINS "https://admin.dev.${BASE_DOMAIN},https://superadmin.dev.${BASE_DOMAIN},https://dev.${BASE_DOMAIN}"
set_env "${WORK_FILE}" CUSTOMER_APP_BASE_DOMAIN "dev.${BASE_DOMAIN}"
set_env "${WORK_FILE}" JWT_ACCESS_SECRET "${JWT_ACCESS_SECRET}"
set_env "${WORK_FILE}" JWT_REFRESH_SECRET "${JWT_REFRESH_SECRET}"
set_env "${WORK_FILE}" STRIPE_SECRET_KEY "${STRIPE_SECRET_KEY}"
set_env "${WORK_FILE}" STRIPE_PUBLISHABLE_KEY "${STRIPE_PUBLISHABLE_KEY}"
set_env "${WORK_FILE}" STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET}"
set_env "${WORK_FILE}" STRIPE_SUCCESS_URL "https://dev.${BASE_DOMAIN}/payment/success"
set_env "${WORK_FILE}" STRIPE_CANCEL_URL "https://dev.${BASE_DOMAIN}/payment/cancel"

if awk '!/^[[:space:]]*#/ && /REPLACE_WITH/ { found = 1 } END { exit !found }' "${WORK_FILE}"; then
  fail "prepared environment still contains placeholders"
fi

getent group "${OUTPUT_GROUP}" >/dev/null || fail "output group does not exist: ${OUTPUT_GROUP}"
install -o root -g "${OUTPUT_GROUP}" -m 640 "${WORK_FILE}" "${OUTPUT_ENV}"
printf 'Development environment prepared at %s (secret values not displayed).\n' "${OUTPUT_ENV}"
