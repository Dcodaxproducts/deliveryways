#!/usr/bin/env bash
# Tests the realtime rollout/rollback scripts against a mock `docker`/`curl`/`sleep` that log every
# invocation: deploy ordering, soak gating, legacy (pre-feature) manifest rollback in both outbox modes,
# and a real `docker compose config` render of the development/staging/production stacks.
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly OUTBOX_MIGRATION=20261013003000_add_realtime_transactional_outbox
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

# --- sandbox: a copy of deploy/ whose preflight is stubbed, plus the rollback SQL -----------------
readonly SANDBOX="${TEST_ROOT}/repo"
mkdir -p "${SANDBOX}/prisma/migrations/${OUTBOX_MIGRATION}" "${TEST_ROOT}/bin" "${TEST_ROOT}/state"
cp -r "${REPO_DIR}/deploy" "${SANDBOX}/deploy"
cp "${REPO_DIR}/prisma/migrations/${OUTBOX_MIGRATION}/rollback.sql" "${SANDBOX}/prisma/migrations/${OUTBOX_MIGRATION}/"
printf '#!/usr/bin/env bash\nexit 0\n' >"${SANDBOX}/deploy/scripts/preflight.sh"
chmod +x "${SANDBOX}/deploy/scripts/"*.sh

export MOCK_STATE="${TEST_ROOT}/state"
export MOCK_LOG="${MOCK_STATE}/docker.log"
export DELIVERYWAY_BACKUP_ROOT="${TEST_ROOT}/backups"
export DELIVERYWAY_RELEASE_ROOT="${TEST_ROOT}/releases"
export PATH="${TEST_ROOT}/bin:${PATH}"

cat >"${TEST_ROOT}/bin/docker" <<'MOCK'
#!/usr/bin/env bash
# Logs `compose` subcommands (global --project-name/--env-file/--file options stripped) and emulates
# just enough container state for the deploy scripts.
args=("$@")
if [[ "${args[0]}" == "compose" ]]; then
  i=1
  while [[ "${args[i]:-}" == --* ]]; do i=$((i + 2)); done
  rest=("${args[@]:i}")
  [[ "${rest[0]:-}" == "--profile" ]] && rest=("${rest[@]:2}")
  sub="${rest[0]:-}"
  case "${sub}" in
    ps)
      service="${rest[-1]}"
      grep -qx "${service}" "${MOCK_STATE}/absent" 2>/dev/null || printf 'cid-%s\n' "${service}"
      exit 0 ;;
    exec)
      stdin_file="$(mktemp -p "${MOCK_STATE}")"
      case " ${rest[*]} " in
        *" psql "* | *" node - "*) cat >"${stdin_file}" ;;
        *) : >"${stdin_file}" ;;
      esac
      case " ${rest[*]} " in
        *" pg_dump "*) printf 'PGDMP-mock\n'; echo "compose pg_dump" >>"${MOCK_LOG}" ;;
        *" pg_restore "* | *" pg_isready "*) ;;
        *" psql "*)
          sql="$(cat "${stdin_file}")"
          if grep -q 'BEGIN;' <<<"${sql}"; then
            cp "${stdin_file}" "${MOCK_STATE}/rollback-tx.sql"
            echo "compose psql rollback-transaction" >>"${MOCK_LOG}"
            [[ "${MOCK_TX_FAIL:-}" != yes ]] || exit 3
          elif grep -q 'json_build_object' <<<"${sql}"; then
            echo "compose psql soak-actor" >>"${MOCK_LOG}"
            printf '{"uid":"soak-user","role":"CUSTOMER","ver":0,"tid":"t1","rid":"r1","bid":null}\n'
          elif grep -q "interval\|last_error IS NOT NULL" <<<"${sql}"; then
            printf '0\n'
          elif grep -q 'published_at IS NULL' <<<"${sql}"; then
            echo "compose psql outbox-pending" >>"${MOCK_LOG}"
            printf '%s\n' "${MOCK_PENDING:-0}"
          fi ;;
        *" node - "*)
          echo "compose soak" >>"${MOCK_LOG}"
          [[ "${MOCK_SOAK_EXIT:-0}" == 0 ]] || { echo 'soak FAILED: mock' >&2; exit 1; } ;;
      esac
      exit 0 ;;
    rm)
      echo "compose rm ${rest[*]:1}" >>"${MOCK_LOG}"
      echo "${rest[-1]}" >>"${MOCK_STATE}/absent"
      exit 0 ;;
    *)
      echo "compose ${rest[*]}" >>"${MOCK_LOG}"
      exit 0 ;;
  esac
fi
if [[ "${args[0]}" == "inspect" ]]; then
  case "$*" in
    *State.Status*) printf 'running healthy\n' ;;
    *State.Running*) printf 'true\n' ;;
    *State.Health*) printf 'healthy\n' ;;
  esac
  exit 0
fi
exit 0
MOCK
cat >"${TEST_ROOT}/bin/curl" <<'MOCK'
#!/usr/bin/env bash
echo "curl ${*: -1}" >>"${MOCK_LOG}"
MOCK
printf '#!/usr/bin/env bash\nexit 0\n' >"${TEST_ROOT}/bin/sleep"
chmod +x "${TEST_ROOT}/bin/"*

# --- fixtures ----------------------------------------------------------------------------------------
readonly SHA=1234567
readonly ENV_FILE="${TEST_ROOT}/env"
cat >"${ENV_FILE}" <<ENV
POSTGRES_DB=dw
POSTGRES_USER=dw
REALTIME_SOAK_USER_ID=soak-user
API_IMAGE=deliveryway-api:newnew1
REALTIME_IMAGE=deliveryway-realtime:newnew1
MIGRATION_IMAGE=deliveryway-migration:newnew1
RESTAURANT_ADMIN_IMAGE=deliveryway-restaurant-admin:newnew1
SUPERADMIN_IMAGE=deliveryway-superadmin:newnew1
CUSTOMER_IMAGE=deliveryway-customer:newnew1
LANDING_IMAGE=deliveryway-landing:newnew1
ENV

# Pre-feature manifest shape: exactly what deploy.sh recorded before REALTIME_IMAGE existed.
readonly LEGACY_MANIFEST="${TEST_ROOT}/legacy.env"
cat >"${LEGACY_MANIFEST}" <<MANIFEST
DEPLOYED_AT=20260930T101500Z
API_IMAGE=deliveryway-api:${SHA}
MIGRATION_IMAGE=deliveryway-migration:${SHA}
RESTAURANT_ADMIN_IMAGE=deliveryway-restaurant-admin:${SHA}
SUPERADMIN_IMAGE=deliveryway-superadmin:${SHA}
CUSTOMER_IMAGE=deliveryway-customer:${SHA}
LANDING_IMAGE=deliveryway-landing:${SHA}
MANIFEST
readonly CURRENT_MANIFEST="${TEST_ROOT}/current.env"
{ cat "${LEGACY_MANIFEST}"; echo "REALTIME_IMAGE=deliveryway-realtime:${SHA}"; } >"${CURRENT_MANIFEST}"

# The fixture must really be the pre-feature shape (checked against history when available).
if git -C "${REPO_DIR}" cat-file -e f1a9e468^:deploy/scripts/common.sh 2>/dev/null; then
  legacy_keys="$(git -C "${REPO_DIR}" show f1a9e468^:deploy/scripts/common.sh \
    | awk '/^dw_image_keys\(\)/,/^}/' | grep -o '[A-Z_]*_IMAGE' | sort | tr '\n' ' ')"
  fixture_keys="$(grep -o '^[A-Z_]*_IMAGE' "${LEGACY_MANIFEST}" | sort | tr '\n' ' ')"
  [[ "${legacy_keys}" == "${fixture_keys}" ]] || { echo "legacy fixture drifted from the pre-feature manifest: ${legacy_keys} vs ${fixture_keys}" >&2; exit 1; }
fi

# --- helpers ---------------------------------------------------------------------------------------------
reset_state() {
  rm -rf "${MOCK_STATE:?}"/* "${DELIVERYWAY_RELEASE_ROOT}" "${DELIVERYWAY_BACKUP_ROOT}"
  : >"${MOCK_LOG}"
  unset MOCK_PENDING MOCK_TX_FAIL MOCK_SOAK_EXIT LEGACY_ROLLBACK_OUTBOX REALTIME_INGRESS_DISABLED OUTBOX_DISCARD_APPROVED OUTBOX_DRAIN_TIMEOUT_SECONDS
}

run() { "${SANDBOX}/deploy/scripts/$1" staging "${ENV_FILE}" "${@:2}"; }

line_of() { grep -n -m1 -- "$1" "${MOCK_LOG}" | cut -d: -f1; }
assert_logged() { grep -q -- "$1" "${MOCK_LOG}" || { echo "expected log entry: $1" >&2; cat "${MOCK_LOG}" >&2; exit 1; }; }
assert_not_logged() { ! grep -q -- "$1" "${MOCK_LOG}" || { echo "unexpected log entry: $1" >&2; cat "${MOCK_LOG}" >&2; exit 1; }; }
assert_order() { # assert_order <pattern>... : each pattern appears, in this order
  local previous=0 current pattern
  for pattern in "$@"; do
    current="$(line_of "${pattern}")" || true
    [[ -n "${current}" ]] || { echo "missing log entry: ${pattern}" >&2; cat "${MOCK_LOG}" >&2; exit 1; }
    [[ "${current}" -gt "${previous}" ]] || { echo "out of order: ${pattern} (line ${current} <= ${previous})" >&2; cat "${MOCK_LOG}" >&2; exit 1; }
    previous="${current}"
  done
}
expect_failure() {
  local expected="$1" output
  shift
  if output="$("$@" 2>&1)"; then echo "expected failure: $*" >&2; exit 1; fi
  grep -Fq -- "${expected}" <<<"${output}" || { echo "missing '${expected}' in: ${output}" >&2; exit 1; }
}
pass() { printf '  ok  %s\n' "$1"; }

# --- deploy order ----------------------------------------------------------------------------------------
reset_state
SKIP_IMAGE_PULL=yes run deploy.sh >/dev/null
assert_order 'up --detach --no-build --wait postgres' 'compose pg_dump' 'run --rm --no-deps migration' \
  'up --detach --no-build --no-deps --wait api$' 'up --detach --no-build --no-deps --wait --scale realtime=1 realtime$' \
  'compose psql soak-actor' 'compose soak' \
  'up --detach --no-build --no-deps --wait restaurant-admin superadmin customer landing$' 'curl .*/ready$'
grep -q '^REALTIME_IMAGE=deliveryway-realtime:newnew1$' "${DELIVERYWAY_RELEASE_ROOT}/staging/current.env"
pass 'deploy: backup -> migration -> API -> realtime -> authenticated soak -> clients -> smoke -> manifest'

reset_state
export MOCK_SOAK_EXIT=1
expect_failure 'realtime soak failed' env SKIP_IMAGE_PULL=yes "${SANDBOX}/deploy/scripts/deploy.sh" staging "${ENV_FILE}"
assert_logged 'compose soak'
assert_not_logged 'restaurant-admin'
[[ ! -e "${DELIVERYWAY_RELEASE_ROOT}/staging/current.env" ]] || { echo 'failed soak must not record a release' >&2; exit 1; }
pass 'deploy: a failed soak stops before clients are switched and records nothing'

reset_state
expect_failure 'the production realtime soak cannot be skipped' \
  env PRODUCTION_DEPLOY_APPROVED=yes SKIP_REALTIME_SOAK=yes "${SANDBOX}/deploy/scripts/deploy.sh" production "${ENV_FILE}"
pass 'deploy: production cannot skip the soak'

# --- rollback: current-shape manifest ----------------------------------------------------------------
reset_state
SKIP_IMAGE_PULL=yes run rollback.sh "${CURRENT_MANIFEST}" >/dev/null
assert_order 'up .* customer$' 'up .* realtime$' 'up .* api$'
assert_not_logged 'compose psql'
assert_not_logged 'rm --force realtime'
pass 'rollback: manifest with REALTIME_IMAGE restores clients, realtime, API; database untouched'

# --- rollback: legacy manifest (no REALTIME_IMAGE) -------------------------------------------------------------
reset_state
expect_failure 'REALTIME_INGRESS_DISABLED=yes' env SKIP_IMAGE_PULL=yes "${SANDBOX}/deploy/scripts/rollback.sh" staging "${ENV_FILE}" "${LEGACY_MANIFEST}"
expect_failure 'LEGACY_ROLLBACK_OUTBOX=retain-triggers' \
  env SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes "${SANDBOX}/deploy/scripts/rollback.sh" staging "${ENV_FILE}" "${LEGACY_MANIFEST}"
assert_not_logged ' up '
pass 'legacy rollback: refuses without closed ingress and an explicit outbox decision, touching nothing'

reset_state
SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes LEGACY_ROLLBACK_OUTBOX=retain-triggers run rollback.sh "${LEGACY_MANIFEST}" >/dev/null
assert_logged 'up --detach --no-build --no-deps --wait api'
assert_logged 'up --detach --no-build --no-deps --wait customer'
assert_not_logged 'wait realtime'
assert_not_logged 'stop realtime'
assert_not_logged 'rm --force realtime'
assert_not_logged 'compose psql'
assert_logged 'curl .*/ready$'
[[ "$(readlink "${DELIVERYWAY_RELEASE_ROOT}/staging/current.env")" == *legacy.env ]]
pass 'legacy rollback (retain-triggers): old API/clients restored, realtime keeps running as the dispatcher'

reset_state
SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes LEGACY_ROLLBACK_OUTBOX=drop-migration MOCK_PENDING=0 run rollback.sh "${LEGACY_MANIFEST}" >/dev/null
assert_order 'compose pg_dump' 'up --detach --no-build --no-deps --wait api' 'compose psql outbox-pending' \
  'compose psql rollback-transaction' 'compose stop realtime' 'rm --force realtime'
grep -q 'LOCK TABLE orders, chat_threads, chat_messages IN ACCESS EXCLUSIVE MODE' "${MOCK_STATE}/rollback-tx.sql"
grep -q 'realtime outbox is not drained' "${MOCK_STATE}/rollback-tx.sql"
grep -q 'DROP TABLE IF EXISTS realtime_outbox_events' "${MOCK_STATE}/rollback-tx.sql"
grep -q "DELETE FROM _prisma_migrations WHERE migration_name = '${OUTBOX_MIGRATION}'" "${MOCK_STATE}/rollback-tx.sql"
grep -q 'COMMIT;' "${MOCK_STATE}/rollback-tx.sql"
assert_not_logged 'curl .*:[0-9]*/ready$'
pass 'legacy rollback (drop-migration): backup, drained outbox, one locked transaction, then realtime removed, no realtime smoke'

reset_state
expect_failure 'did not drain' env SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes LEGACY_ROLLBACK_OUTBOX=drop-migration \
  MOCK_PENDING=7 OUTBOX_DRAIN_TIMEOUT_SECONDS=3 "${SANDBOX}/deploy/scripts/rollback.sh" staging "${ENV_FILE}" "${LEGACY_MANIFEST}"
assert_not_logged 'rollback-transaction'
assert_not_logged 'rm --force realtime'
pass 'legacy rollback (drop-migration): an undrained outbox blocks the migration rollback and keeps realtime'

reset_state
SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes LEGACY_ROLLBACK_OUTBOX=drop-migration OUTBOX_DISCARD_APPROVED=yes MOCK_PENDING=7 \
  run rollback.sh "${LEGACY_MANIFEST}" >/dev/null
assert_logged 'rollback-transaction'
! grep -q 'realtime outbox is not drained' "${MOCK_STATE}/rollback-tx.sql"
pass 'legacy rollback (drop-migration): explicit OUTBOX_DISCARD_APPROVED skips the drain check'

reset_state
expect_failure 'was not applied' env SKIP_IMAGE_PULL=yes REALTIME_INGRESS_DISABLED=yes LEGACY_ROLLBACK_OUTBOX=drop-migration \
  MOCK_TX_FAIL=yes "${SANDBOX}/deploy/scripts/rollback.sh" staging "${ENV_FILE}" "${LEGACY_MANIFEST}"
assert_not_logged 'rm --force realtime'
assert_not_logged 'stop realtime'
pass 'legacy rollback (drop-migration): a failed transaction leaves realtime draining the retained triggers'

reset_state
cp "${CURRENT_MANIFEST}" "${TEST_ROOT}/dup.env"
echo "REALTIME_IMAGE=deliveryway-realtime:${SHA}" >>"${TEST_ROOT}/dup.env"
expect_failure 'REALTIME_IMAGE must appear exactly once' env SKIP_IMAGE_PULL=yes "${SANDBOX}/deploy/scripts/rollback.sh" staging "${ENV_FILE}" "${TEST_ROOT}/dup.env"
pass 'rollback: duplicate REALTIME_IMAGE is rejected rather than treated as legacy'

# --- compose renders -----------------------------------------------------------------------------------------
# The mock shadows docker on PATH, so locate the real binary explicitly.
real_docker="$(PATH="${PATH#"${TEST_ROOT}/bin:"}" command -v docker || true)"
if [[ -n "${real_docker}" ]] && "${real_docker}" compose version >/dev/null 2>&1; then
  for environment in development staging production; do
    render_env="${TEST_ROOT}/render.${environment}"
    cp "${REPO_DIR}/deploy/env/.env.${environment}.example" "${render_env}"
    sed -i "s|^DELIVERYWAY_ENV_FILE=.*|DELIVERYWAY_ENV_FILE=${render_env}|; s|^REALTIME_IMAGE=.*|REALTIME_IMAGE=deliveryway-realtime:${SHA}|" "${render_env}"
    override="${REPO_DIR}/deploy/compose.${environment}.yml"
    rendered="$("${real_docker}" compose --env-file "${render_env}" -f "${REPO_DIR}/deploy/compose.yml" -f "${override}" --profile '*' config)"
    grep -q "image: deliveryway-realtime:${SHA}" <<<"${rendered}"
    grep -q 'REALTIME_PORT: "3001"' <<<"${rendered}"
    awk '/^  realtime:/,/^  restaurant-admin:/' <<<"${rendered}" | grep -q 'host_ip: 127.0.0.1'
    pass "compose ${environment} renders with a loopback-only realtime service"
  done
fi

printf '%s\n' 'realtime rollout/rollback tests passed'
