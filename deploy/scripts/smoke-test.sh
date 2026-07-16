#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
dw_preflight

command -v curl >/dev/null 2>&1 || dw_fail "curl is required for smoke tests"

if [[ "${DW_ENVIRONMENT}" == "staging" ]]; then
  readonly API_PORT=6050
  readonly RESTAURANT_ADMIN_PORT=6051
  readonly SUPERADMIN_PORT=6052
  readonly CUSTOMER_PORT=6053
  readonly LANDING_PORT=6054
else
  readonly API_PORT=5050
  readonly RESTAURANT_ADMIN_PORT=5051
  readonly SUPERADMIN_PORT=5052
  readonly CUSTOMER_PORT=5053
  readonly LANDING_PORT=5054
fi

readonly SERVICES=(postgres api restaurant-admin superadmin customer landing)
for service in "${SERVICES[@]}"; do
  container_id="$(dw_compose ps --quiet "${service}")"
  [[ -n "${container_id}" ]] || dw_fail "${service} container is missing"

  state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "${container_id}")"
  [[ "${state}" == "running healthy" ]] || dw_fail "${service} is not healthy (${state})"
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

printf 'Running %s localhost smoke tests...\n' "${DW_ENVIRONMENT}"
probe api "http://127.0.0.1:${API_PORT}/api/v1/health/live"
probe restaurant-admin "http://127.0.0.1:${RESTAURANT_ADMIN_PORT}/login"
probe superadmin "http://127.0.0.1:${SUPERADMIN_PORT}/auth/login"
probe customer "http://127.0.0.1:${CUSTOMER_PORT}/auth/login"
probe landing "http://127.0.0.1:${LANDING_PORT}/"
printf 'Smoke tests passed.\n'
