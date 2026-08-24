#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly FF_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

ff_init "${1:-}" "${2:-}"
ff_preflight

command -v curl >/dev/null 2>&1 || ff_fail "curl is required for smoke tests"

case "${FF_ENVIRONMENT}" in
  staging)
    readonly API_PORT=5210
    readonly RESTAURANT_ADMIN_PORT=5211
    readonly SUPERADMIN_PORT=5212
    readonly CUSTOMER_PORT=5213
    readonly LANDING_PORT=5214
    ;;
  production)
    readonly API_PORT=5200
    readonly RESTAURANT_ADMIN_PORT=5201
    readonly SUPERADMIN_PORT=5202
    readonly CUSTOMER_PORT=5203
    readonly LANDING_PORT=5204
    ;;
esac

readonly SERVICES=(postgres api restaurant-admin superadmin customer landing)
for service in "${SERVICES[@]}"; do
  container_id="$(ff_compose ps --quiet "${service}")"
  [[ -n "${container_id}" ]] || ff_fail "${service} container is missing"

  state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "${container_id}")"
  [[ "${state}" == "running healthy" ]] || ff_fail "${service} is not healthy (${state})"
done

probe() {
  local name="$1"
  local url="$2"

  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --max-time 10 \
    --retry 5 \
    --retry-connrefused \
    --retry-delay 2 \
    --output /dev/null \
    "${url}"
  printf '  OK  %s\n' "${name}"
}

printf 'Running %s localhost smoke tests...\n' "${FF_ENVIRONMENT}"
probe api "http://127.0.0.1:${API_PORT}/api/v1/health/live"
probe restaurant-admin "http://127.0.0.1:${RESTAURANT_ADMIN_PORT}/login"
probe superadmin "http://127.0.0.1:${SUPERADMIN_PORT}/auth/login"
probe customer "http://127.0.0.1:${CUSTOMER_PORT}/auth/login"
probe landing "http://127.0.0.1:${LANDING_PORT}/"
printf 'Smoke tests passed.\n'
