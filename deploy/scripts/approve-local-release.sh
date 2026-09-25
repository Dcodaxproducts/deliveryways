#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"

[[ "${DW_ENVIRONMENT}" == "production" ]] \
  || dw_fail "local release approvals are supported only for production"
[[ "$(id -u)" -eq 0 ]] || dw_fail "local release approval must run as root"

DEVELOPMENT_RELEASE="${3:-}"
readonly RELEASE_SERVICES="${4:-}"
[[ -n "${DEVELOPMENT_RELEASE}" ]] || dw_fail "Development release manifest is required"
[[ -n "${RELEASE_SERVICES}" ]] || dw_fail "comma-separated release services are required"
[[ ",${RELEASE_SERVICES}," == *,migration,* ]] \
  || dw_fail "local Production release must include migration"

readonly DEVELOPMENT_RELEASE_DIR="${DW_RELEASE_ROOT}/development"
DEVELOPMENT_RELEASE="$(dw_validate_manifest_file \
  "${DEVELOPMENT_RELEASE}" "${DEVELOPMENT_RELEASE_DIR}" \
  'Development release manifest')"
DEVELOPMENT_DEPLOYED_AT="$(dw_manifest_value \
  "${DEVELOPMENT_RELEASE}" DEPLOYED_AT)" \
  || dw_fail "Development release must contain exactly one DEPLOYED_AT"
readonly DEVELOPMENT_DEPLOYED_AT
[[ "${DEVELOPMENT_DEPLOYED_AT}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] \
  || dw_fail "Development DEPLOYED_AT must use YYYYMMDDTHHMMSSZ"
[[ "$(basename "${DEVELOPMENT_RELEASE}")" == "${DEVELOPMENT_DEPLOYED_AT}.env" ]] \
  || dw_fail "Development release filename does not match DEPLOYED_AT"

dw_preflight

readonly APPROVAL_DIR="${DW_RELEASE_ROOT}/approvals/production"
readonly APPROVAL_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 0750 "${APPROVAL_DIR}"
[[ "$(stat -c '%U:%G:%a' "${APPROVAL_DIR}")" == "root:root:750" ]] \
  || dw_fail "Production approval directory must be root:root mode 750"
APPROVAL_TEMP_FILE="$(mktemp "${APPROVAL_DIR}/.${APPROVAL_TIMESTAMP}.XXXXXX.tmp")"
APPROVAL_SUFFIX="${APPROVAL_TEMP_FILE##*.${APPROVAL_TIMESTAMP}.}"
APPROVAL_SUFFIX="${APPROVAL_SUFFIX%.tmp}"
readonly APPROVAL_SUFFIX
readonly APPROVAL_FILE="${APPROVAL_DIR}/${APPROVAL_TIMESTAMP}.${APPROVAL_SUFFIX}.env"
trap 'rm -f -- "${APPROVAL_TEMP_FILE}"' EXIT

{
  printf 'APPROVED_AT=%s\n' "${APPROVAL_TIMESTAMP}"
  printf 'DEVELOPMENT_RELEASE=%s\n' "${DEVELOPMENT_RELEASE}"
  printf 'LOCAL_RELEASE_SERVICES=%s\n' "${RELEASE_SERVICES}"

  IFS=',' read -r -a services <<<"${RELEASE_SERVICES}"
  for service in "${services[@]}"; do
    key="$(dw_image_key_for_service "${service}")"
    production_image="$(dw_read_env "${key}")"
    development_image="$(dw_manifest_value "${DEVELOPMENT_RELEASE}" "${key}")" \
      || dw_fail "Development release must contain exactly one ${key}"
    production_revision="${production_image##*:}"
    development_revision="${development_image##*:}"
    [[ "${production_revision}" == "${development_revision}" ]] \
      || dw_fail "Production ${key} revision did not pass Development"
    image_id="$(docker image inspect --format '{{.Id}}' "${production_image}" 2>/dev/null)" \
      || dw_fail "Production image is not available locally: ${production_image}"
    printf '%s=%s\n' "${key}" "${production_image}"
    printf '%s_ID=%s\n' "${key}" "${image_id}"
  done
} >"${APPROVAL_TEMP_FILE}"

chmod 0640 "${APPROVAL_TEMP_FILE}"
[[ ! -e "${APPROVAL_FILE}" ]] || dw_fail "approval destination already exists"
mv --no-clobber -- "${APPROVAL_TEMP_FILE}" "${APPROVAL_FILE}"
trap - EXIT
printf 'Local Production release approved: %s\n' "${APPROVAL_FILE}"
