#!/usr/bin/env bash
# Private, authenticated soak of the freshly started realtime gateway. Runs entirely inside the
# realtime container against 127.0.0.1 (never through ingress). Must pass before clients are switched.
#
# Requires REALTIME_SOAK_USER_ID in the env file: a dedicated, active, least-privileged account
# (a CUSTOMER of a real restaurant is enough). Its role/scope/auth_version are read from the database,
# a short-lived token is minted inside the container, and the soak verifies that authenticated
# /chat and /orders-tracking sockets stay connected, anonymous and forged-token sockets are refused,
# /ready reports this single instance as outbox leader with a ready Redis adapter, and the outbox has
# no failed rows and no stale backlog afterwards.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DW_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

dw_init "${1:-}" "${2:-}"
dw_preflight

soak_user="$(dw_read_env REALTIME_SOAK_USER_ID)" \
  || dw_fail "REALTIME_SOAK_USER_ID must appear exactly once in ${DW_ENV_FILE}"
[[ "${soak_user}" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || dw_fail "REALTIME_SOAK_USER_ID has an unexpected format"
soak_seconds="${REALTIME_SOAK_SECONDS:-20}"
[[ "${soak_seconds}" =~ ^[0-9]{1,3}$ ]] || dw_fail "REALTIME_SOAK_SECONDS must be a number of seconds"

actor_json="$(dw_psql --tuples-only --no-align --set "soak_user=${soak_user}" <<'SQL' | tr -d '\r'
SELECT json_build_object('uid', id, 'role', role::text, 'ver', auth_version,
                         'tid', tenant_id, 'rid', restaurant_id, 'bid', branch_id)
FROM users WHERE id = :'soak_user' AND is_active AND deleted_at IS NULL
SQL
)"
[[ "${actor_json}" == \{* ]] || dw_fail "soak account ${soak_user} was not found as an active user"

printf 'Running %s private realtime soak (%ss)...\n' "${DW_ENVIRONMENT}" "${soak_seconds}"
dw_compose exec --no-TTY \
  --env "SOAK_ACTOR=${actor_json}" --env "SOAK_SECONDS=${soak_seconds}" \
  realtime node - <"${SCRIPT_DIR}/realtime-soak.js" \
  || dw_fail "realtime soak failed; do not switch clients or ingress"

failed_rows="$(dw_psql --tuples-only --no-align \
  <<<"SELECT count(*) FROM realtime_outbox_events WHERE published_at IS NULL AND last_error IS NOT NULL" | tr -d '[:space:]')"
stale_rows="$(dw_psql --tuples-only --no-align \
  <<<"SELECT count(*) FROM realtime_outbox_events WHERE published_at IS NULL AND last_error IS NULL AND created_at < now() - interval '60 seconds'" | tr -d '[:space:]')"
[[ "${failed_rows}" == "0" ]] || dw_fail "${failed_rows} realtime outbox row(s) failed delivery"
[[ "${stale_rows}" == "0" ]] || dw_fail "${stale_rows} realtime outbox row(s) are stuck pending for over 60s"
printf 'Realtime soak passed; outbox has no failed or stuck rows.\n'
