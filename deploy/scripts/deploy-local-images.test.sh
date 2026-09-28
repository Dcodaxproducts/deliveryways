#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

expect_failure() {
  local expected="$1"
  shift
  local output

  if output="$("$@" 2>&1)"; then
    printf 'Expected command to fail: %s\n' "$*" >&2
    exit 1
  fi
  grep -Fq "${expected}" <<<"${output}"
}

expect_failure 'production requires PRODUCTION_DEPLOY_APPROVED=yes' \
  env USE_LOCAL_RELEASE_IMAGES=yes \
  "${DEPLOY_SCRIPT}" production "${TEST_ROOT}/missing.env"
expect_failure 'local production images require PRODUCTION_LOCAL_IMAGES_APPROVED=yes' \
  env PRODUCTION_DEPLOY_APPROVED=yes USE_LOCAL_RELEASE_IMAGES=yes \
  "${DEPLOY_SCRIPT}" production "${TEST_ROOT}/missing.env"
expect_failure 'local release images are supported only for production' \
  env USE_LOCAL_RELEASE_IMAGES=yes PRODUCTION_LOCAL_IMAGES_APPROVED=yes \
  "${DEPLOY_SCRIPT}" staging "${TEST_ROOT}/missing.env"
expect_failure 'production image pulls cannot be skipped' \
  env PRODUCTION_DEPLOY_APPROVED=yes SKIP_IMAGE_PULL=yes \
  "${DEPLOY_SCRIPT}" production "${TEST_ROOT}/missing.env"

mkdir -p "${TEST_ROOT}/bin" \
  "${TEST_ROOT}/releases/approvals/production"
cat >"${TEST_ROOT}/bin/docker" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1 $2 $3" == "image inspect --format" ]]; then
  [[ "$*" != *deadbee* ]] || exit 1
  printf '%s\n' 'sha256:approved'
  exit 0
fi
exit 1
MOCK
chmod +x "${TEST_ROOT}/bin/docker"

cat >"${TEST_ROOT}/release.env" <<'ENV'
API_IMAGE=deliveryway-api:1234567
MIGRATION_IMAGE=deliveryway-migration:1234567
RESTAURANT_ADMIN_IMAGE=deliveryway-restaurant-admin:1234567
SUPERADMIN_IMAGE=deliveryway-superadmin:1234567
CUSTOMER_IMAGE=deliveryway-customer:1234567
LANDING_IMAGE=deliveryway-landing:1234567
ENV
cat >"${TEST_ROOT}/releases/approvals/production/approval.env" <<'ENV'
API_IMAGE=deliveryway-api:1234567
API_IMAGE_ID=sha256:approved
MIGRATION_IMAGE=deliveryway-migration:1234567
MIGRATION_IMAGE_ID=sha256:approved
CUSTOMER_IMAGE=deliveryway-customer:1234567
CUSTOMER_IMAGE_ID=sha256:approved
ENV
chmod 0640 "${TEST_ROOT}/releases/approvals/production/approval.env"

verify_output="$({
  export PATH="${TEST_ROOT}/bin:${PATH}"
  export DW_ENV_FILE="${TEST_ROOT}/release.env"
  export DW_RELEASE_ROOT="${TEST_ROOT}/releases"
  export LOCAL_RELEASE_APPROVAL_FILE="${TEST_ROOT}/releases/approvals/production/approval.env"
  export LOCAL_RELEASE_SERVICES='api,migration,customer'
  # shellcheck source=common.sh
  source "${SCRIPT_DIR}/common.sh"
  dw_verify_local_release_approval
})"
[[ "$(grep -Fc 'OK  approved local image' <<<"${verify_output}")" -eq 3 ]]

sed -i 's|^CUSTOMER_IMAGE_ID=.*|CUSTOMER_IMAGE_ID=sha256:wrong|' "${TEST_ROOT}/releases/approvals/production/approval.env"
expect_failure 'local image ID does not match approval: deliveryway-customer:1234567' \
  env PATH="${TEST_ROOT}/bin:${PATH}" \
  DW_ENV_FILE="${TEST_ROOT}/release.env" \
  DW_RELEASE_ROOT="${TEST_ROOT}/releases" \
  LOCAL_RELEASE_APPROVAL_FILE="${TEST_ROOT}/releases/approvals/production/approval.env" \
  LOCAL_RELEASE_SERVICES='api,migration,customer' \
  bash -c 'source "$1/common.sh"; dw_verify_local_release_approval' bash "${SCRIPT_DIR}"

sed -i 's|^CUSTOMER_IMAGE_ID=.*|CUSTOMER_IMAGE_ID=sha256:approved|' \
  "${TEST_ROOT}/releases/approvals/production/approval.env"
expect_failure 'local Production release must approve the migration service' \
  env PATH="${TEST_ROOT}/bin:${PATH}" \
  DW_ENV_FILE="${TEST_ROOT}/release.env" \
  DW_RELEASE_ROOT="${TEST_ROOT}/releases" \
  LOCAL_RELEASE_APPROVAL_FILE="${TEST_ROOT}/releases/approvals/production/approval.env" \
  LOCAL_RELEASE_SERVICES='api,customer' \
  bash -c 'source "$1/common.sh"; dw_verify_local_release_approval' bash "${SCRIPT_DIR}"

ln -s "${TEST_ROOT}/releases/approvals/production/approval.env" \
  "${TEST_ROOT}/releases/approvals/production/approval-link.env"
expect_failure 'local release approval is missing, unreadable, or a symlink' \
  env PATH="${TEST_ROOT}/bin:${PATH}" \
  DW_ENV_FILE="${TEST_ROOT}/release.env" \
  DW_RELEASE_ROOT="${TEST_ROOT}/releases" \
  LOCAL_RELEASE_APPROVAL_FILE="${TEST_ROOT}/releases/approvals/production/approval-link.env" \
  LOCAL_RELEASE_SERVICES='api,migration,customer' \
  bash -c 'source "$1/common.sh"; dw_verify_local_release_approval' bash "${SCRIPT_DIR}"

mkdir -p "${TEST_ROOT}/releases/approvals/production/nested"
cp "${TEST_ROOT}/releases/approvals/production/approval.env" \
  "${TEST_ROOT}/releases/approvals/production/nested/approval.env"
expect_failure 'local release approval must be stored directly under' \
  env PATH="${TEST_ROOT}/bin:${PATH}" \
  DW_ENV_FILE="${TEST_ROOT}/release.env" \
  DW_RELEASE_ROOT="${TEST_ROOT}/releases" \
  LOCAL_RELEASE_APPROVAL_FILE="${TEST_ROOT}/releases/approvals/production/nested/approval.env" \
  LOCAL_RELEASE_SERVICES='api,migration,customer' \
  bash -c 'source "$1/common.sh"; dw_verify_local_release_approval' bash "${SCRIPT_DIR}"

grep -Fq -- '--no-deps --wait' "${SCRIPT_DIR}/deploy.sh"
grep -Fq -- 'mv --no-clobber' "${SCRIPT_DIR}/approve-local-release.sh"
grep -Fq -- '^[0-9]{8}T[0-9]{6}Z$' "${SCRIPT_DIR}/approve-local-release.sh"
validation_line="$(grep -n 'local release must include at least one application service' \
  "${SCRIPT_DIR}/deploy.sh" | cut -d: -f1)"
backup_line="$(grep -n '^backup_output=' "${SCRIPT_DIR}/deploy.sh" | cut -d: -f1)"
[[ "${validation_line}" -lt "${backup_line}" ]]

printf '%s\n' 'local production image deployment tests passed'
