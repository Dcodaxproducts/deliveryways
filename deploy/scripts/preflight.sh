#!/usr/bin/env bash

set -Eeuo pipefail

readonly ENVIRONMENT="${1:-}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

fail() {
  printf 'Preflight failed: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf '  OK  %s\n' "$1"
}

read_env() {
  local key="$1"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count > 1) exit 2
    }
  ' "${ENV_FILE}"
}

require_env() {
  local key="$1"
  local value

  value="$(read_env "${key}")" || fail "${key} must appear exactly once"
  [[ -n "${value}" ]] || fail "${key} is required"
}

case "${ENVIRONMENT}" in
  development)
    readonly PROJECT_NAME="deliveryway-development"
    readonly OVERRIDE_FILE="${DEPLOY_DIR}/compose.development.yml"
    ;;
  staging)
    readonly PROJECT_NAME="deliveryway-staging"
    readonly OVERRIDE_FILE="${DEPLOY_DIR}/compose.staging.yml"
    ;;
  production)
    readonly PROJECT_NAME="deliveryway-prod"
    readonly OVERRIDE_FILE="${DEPLOY_DIR}/compose.production.yml"
    ;;
  *)
    fail "usage: $0 <development|staging|production> [env-file]"
    ;;
esac

readonly ENV_FILE="${2:-/opt/deliveryway/env/.env.${ENVIRONMENT}}"
readonly COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

printf 'DeliveryWay %s preflight (read-only)\n' "${ENVIRONMENT}"

[[ -f "${ENV_FILE}" ]] || fail "environment file not found: ${ENV_FILE}"
[[ -r "${ENV_FILE}" ]] || fail "environment file is not readable by $(id -un)"
[[ "$(stat -c '%U' "${ENV_FILE}")" == "root" ]] || fail "environment file must be owned by root"

readonly ENV_MODE="$(stat -c '%a' "${ENV_FILE}")"
[[ "${ENV_MODE}" == "600" || "${ENV_MODE}" == "640" ]] || fail "environment file mode must be 600 or 640, found ${ENV_MODE}"
pass "environment file ownership and permissions"

if grep -Ev '^[[:space:]]*#' "${ENV_FILE}" \
  | grep -Eq 'REPLACE_WITH|CHANGE_ME|change-me|example\.com'; then
  fail "environment file still contains placeholder values"
fi
pass "no placeholder values"

REQUIRED_KEYS=(
  DELIVERYWAY_ENV_FILE
  EXPECTED_HOSTNAME
  EXPECTED_SERVER_IPV4
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  DATABASE_URL
  API_IMAGE
  MIGRATION_IMAGE
  RESTAURANT_ADMIN_IMAGE
  SUPERADMIN_IMAGE
  CUSTOMER_IMAGE
  LANDING_IMAGE
  PUBLIC_API_ROOT_URL
  PUBLIC_API_BASE_URL
  PUBLIC_RESTAURANT_ADMIN_URL
  PUBLIC_CUSTOMER_URL
  CORS_ORIGINS
  CUSTOMER_APP_BASE_DOMAIN
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  STRIPE_SECRET_KEY
  STRIPE_PUBLISHABLE_KEY
  STRIPE_WEBHOOK_SECRET
)

if [[ "${ENVIRONMENT}" != "development" ]]; then
  REQUIRED_KEYS+=(
    GOOGLE_CLIENT_ID
    GOOGLE_MAPS_API_KEY
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_REGION
    AWS_BUCKET_NAME
    FIREBASE_SERVICE_ACCOUNT_JSON
  )
fi
readonly REQUIRED_KEYS

for key in "${REQUIRED_KEYS[@]}"; do
  require_env "${key}"
done
pass "required environment values"

if [[ "$(read_env QZ_SIGNING_ENABLED)" == "true" ]]; then
  require_env QZ_CERTIFICATE_PATH
  require_env QZ_PRIVATE_KEY_PATH
  require_env QZ_CERTIFICATE_HOST_PATH
  require_env QZ_PRIVATE_KEY_HOST_PATH

  [[ "$(read_env QZ_CERTIFICATE_PATH)" == "/run/secrets/qz_certificate" ]] \
    || fail "QZ_CERTIFICATE_PATH must equal /run/secrets/qz_certificate"
  [[ "$(read_env QZ_PRIVATE_KEY_PATH)" == "/run/secrets/qz_private_key" ]] \
    || fail "QZ_PRIVATE_KEY_PATH must equal /run/secrets/qz_private_key"

  readonly QZ_CERTIFICATE_SOURCE="$(read_env QZ_CERTIFICATE_HOST_PATH)"
  readonly QZ_PRIVATE_KEY_SOURCE="$(read_env QZ_PRIVATE_KEY_HOST_PATH)"

  [[ -s "${QZ_CERTIFICATE_SOURCE}" ]] || fail "QZ certificate is missing or empty: ${QZ_CERTIFICATE_SOURCE}"
  [[ -s "${QZ_PRIVATE_KEY_SOURCE}" ]] || fail "QZ private key is missing or empty: ${QZ_PRIVATE_KEY_SOURCE}"
  [[ "$(stat -c '%u:%g:%a' "${QZ_CERTIFICATE_SOURCE}")" == "0:0:644" ]] \
    || fail "QZ certificate must be owned by root:root with mode 0644"
  [[ "$(stat -c '%u:%g:%a' "${QZ_PRIVATE_KEY_SOURCE}")" == "0:1000:640" ]] \
    || fail "QZ private key must be owned by root:1000 with mode 0640"
  pass "QZ signing secret files and container paths"
fi

[[ "$(read_env DELIVERYWAY_ENV_FILE)" == "${ENV_FILE}" ]] || fail "DELIVERYWAY_ENV_FILE must equal ${ENV_FILE}"
[[ "$(read_env DATABASE_URL)" == *"@postgres:5432/"* ]] || fail "DATABASE_URL must use the private postgres:5432 service"
[[ "$(read_env CORS_ORIGINS)" != *'*'* ]] || fail "CORS_ORIGINS must not contain a wildcard"
pass "private database URL and explicit CORS origins"

readonly IMAGE_KEYS=(API_IMAGE MIGRATION_IMAGE RESTAURANT_ADMIN_IMAGE SUPERADMIN_IMAGE CUSTOMER_IMAGE LANDING_IMAGE)
for key in "${IMAGE_KEYS[@]}"; do
  value="$(read_env "${key}")"
  if [[ ! "${value}" =~ (@sha256:[a-f0-9]{64}|:[a-f0-9]{7,40})$ ]]; then
    fail "${key} must end in a Git SHA tag or sha256 digest"
  fi
done
pass "immutable application image references"

if [[ "${ENVIRONMENT}" == "development" || "${ENVIRONMENT}" == "staging" ]]; then
  [[ "$(read_env STRIPE_SECRET_KEY)" == sk_test_* ]] || fail "${ENVIRONMENT} must use a Stripe test secret key"
  [[ "$(read_env STRIPE_PUBLISHABLE_KEY)" == pk_test_* ]] || fail "${ENVIRONMENT} must use a Stripe test publishable key"
else
  [[ "$(read_env STRIPE_SECRET_KEY)" == sk_live_* ]] || fail "production must use a Stripe live secret key"
  [[ "$(read_env STRIPE_PUBLISHABLE_KEY)" == pk_live_* ]] || fail "production must use a Stripe live publishable key"
fi
pass "Stripe key mode matches ${ENVIRONMENT}"

[[ "$(hostname)" == "$(read_env EXPECTED_HOSTNAME)" ]] || fail "hostname does not match EXPECTED_HOSTNAME"
readonly EXPECTED_SERVER_IPV4="$(read_env EXPECTED_SERVER_IPV4)"
[[ " $(hostname -I) " == *" ${EXPECTED_SERVER_IPV4} "* ]] || fail "server address does not match EXPECTED_SERVER_IPV4"
pass "host identity"

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to $(id -un)"
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is unavailable"
pass "Docker Engine and Compose"

readonly REQUIRED_FILES=(
  "${DEPLOY_DIR}/../Dockerfile"
  "${DEPLOY_DIR}/../../deliveryway-restaurant-admin/Dockerfile"
  "${DEPLOY_DIR}/../../deliveryway-superadmin/Dockerfile"
  "${DEPLOY_DIR}/../../deliveryway-customer-website/Dockerfile"
  "${DEPLOY_DIR}/../../Deliveryway-landing-page/Dockerfile"
  "${COMPOSE_FILE}"
  "${OVERRIDE_FILE}"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "${file}" ]] || fail "required deployment file not found: ${file}"
done
pass "repository and deployment file layout"

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  --file "${COMPOSE_FILE}" \
  --file "${OVERRIDE_FILE}" \
  --profile "*" \
  config --quiet
pass "Compose configuration renders"

printf 'Preflight passed; no containers, networks, volumes, or data were changed.\n'
