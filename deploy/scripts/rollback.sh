#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly FF_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

ff_init "${1:-}" "${2:-}"
readonly RELEASE_FILE="${3:-}"

[[ -n "${RELEASE_FILE}" ]] || ff_fail "usage: $0 <staging|production> <env-file> <release-manifest>"
[[ -f "${RELEASE_FILE}" ]] || ff_fail "release manifest not found: ${RELEASE_FILE}"

if [[ "${FF_ENVIRONMENT}" == "production" && "${PRODUCTION_ROLLBACK_APPROVED:-}" != "yes" ]]; then
  ff_fail "production requires PRODUCTION_ROLLBACK_APPROVED=yes"
fi
if [[ "${FF_ENVIRONMENT}" == "production" && "${SKIP_IMAGE_PULL:-}" == "yes" ]]; then
  ff_fail "production image pulls cannot be skipped"
fi

ff_preflight

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
  value="$(read_manifest "${key}")" || ff_fail "${key} must appear exactly once in the release manifest"
  ff_is_immutable_image "${value}" || ff_fail "${key} is not an immutable image reference"
  printf -v "${key}" '%s' "${value}"
  export "${key}"
done < <(ff_image_keys)

readonly APP_SERVICES=(api restaurant-admin superadmin customer landing)
if [[ "${SKIP_IMAGE_PULL:-}" != "yes" ]]; then
  ff_compose pull "${APP_SERVICES[@]}"
fi

printf 'Rolling application services back; database and volume are unchanged...\n'
ff_compose up --detach --no-build --no-deps --wait "${APP_SERVICES[@]}"
"${SCRIPT_DIR}/smoke-test.sh" "${FF_ENVIRONMENT}" "${FF_ENV_FILE}"

readonly RELEASE_DIR="${FF_RELEASE_ROOT}/${FF_ENVIRONMENT}"
install -d -m 0750 "${RELEASE_DIR}"
ln -sfn "$(realpath --relative-to="${RELEASE_DIR}" "${RELEASE_FILE}")" "${RELEASE_DIR}/current.env"
printf 'Rollback completed to: %s\n' "${RELEASE_FILE}"
printf 'Database rollback was not attempted.\n'
