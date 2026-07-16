#!/usr/bin/env bash

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

read_manifest() {
  local key="$1"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      count++
      print substr($0, length(key) + 2)
    }
    END {
      if (count != 1) exit 2
    }
  ' "${RELEASE_FILE}"
}

while IFS= read -r key; do
  value="$(read_manifest "${key}")" || dw_fail "${key} must appear exactly once in the release manifest"
  dw_is_immutable_image "${value}" || dw_fail "${key} is not an immutable image reference"
  printf -v "${key}" '%s' "${value}"
  export "${key}"
done < <(dw_image_keys)

readonly APP_SERVICES=(api restaurant-admin superadmin customer landing)
if [[ "${SKIP_IMAGE_PULL:-}" != "yes" ]]; then
  dw_compose pull "${APP_SERVICES[@]}"
fi

printf 'Rolling application services back; database and volume are unchanged...\n'
dw_compose up --detach --no-build --no-deps --wait "${APP_SERVICES[@]}"
"${SCRIPT_DIR}/smoke-test.sh" "${DW_ENVIRONMENT}" "${DW_ENV_FILE}"

readonly RELEASE_DIR="${DW_RELEASE_ROOT}/${DW_ENVIRONMENT}"
install -d -m 0750 "${RELEASE_DIR}"
ln -sfn "$(realpath --relative-to="${RELEASE_DIR}" "${RELEASE_FILE}")" "${RELEASE_DIR}/current.env"
printf 'Rollback completed to: %s\n' "${RELEASE_FILE}"
printf 'Database rollback was not attempted.\n'
