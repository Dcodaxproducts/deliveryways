#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly FF_DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/common.sh"

readonly ENVIRONMENT="${1:-}"
readonly ORDER_ID="${3:-}"
readonly EXPECTED_STATE="${4:-paid}"

if [[ "${ENVIRONMENT}" != "staging" ]]; then
  ff_fail "payment acceptance verification is limited to staging"
fi

ff_init "${ENVIRONMENT}" "${2:-/opt/feastflow/env/.env.${ENVIRONMENT}}"

[[ "${ORDER_ID}" =~ ^[A-Za-z0-9_-]{10,64}$ ]] \
  || ff_fail "a valid order ID is required as the third argument"
[[ "${EXPECTED_STATE}" == "paid" || "${EXPECTED_STATE}" == "pending" ]] \
  || ff_fail "expected state must be paid or pending"

ff_preflight

readonly SQL="
SELECT concat_ws(E'\\t',
  o.status,
  o.payment_status,
  o.payment_method,
  CASE WHEN o.paid_at IS NULL THEN 'false' ELSE 'true' END,
  (
    SELECT count(*)
    FROM payment_transactions pt
    WHERE pt.order_id = o.id
      AND pt.type = 'CHARGE'
      AND pt.status = 'PAID'
      AND pt.payment_method = o.payment_method
  ),
  (
    SELECT count(*)
    FROM payment_transactions pt
    WHERE pt.order_id = o.id
      AND pt.type = 'CHARGE'
      AND pt.status = 'PAID'
      AND pt.payment_method = o.payment_method
      AND pt.provider_ref IS NOT NULL
      AND pt.processed_at IS NOT NULL
  ),
  (
    SELECT count(*)
    FROM notifications n
    WHERE n.order_id = o.id
      AND n.type = 'ORDER_PLACED'
      AND n.audience = 'ADMIN'
      AND n.channel = 'IN_APP'
  )
)
FROM orders o
WHERE o.id = '${ORDER_ID}';
"

result="$({
  printf '%s\n' "${SQL}"
} | ff_compose exec -T postgres sh -lc \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At')"

[[ -n "${result}" ]] || ff_fail "order not found: ${ORDER_ID}"

IFS=$'\t' read -r \
  order_status \
  payment_status \
  payment_method \
  has_paid_at \
  paid_charge_count \
  complete_charge_count \
  new_order_notification_count <<< "${result}"

[[ "${payment_method}" == "STRIPE" || "${payment_method}" == "PAYPAL" ]] \
  || ff_fail "order uses ${payment_method}, not Stripe or PayPal"

if [[ "${EXPECTED_STATE}" == "paid" ]]; then
  [[ "${order_status}" == "PLACED" ]] \
    || ff_fail "order status is ${order_status}, expected PLACED"
  [[ "${payment_status}" == "PAID" ]] \
    || ff_fail "payment status is ${payment_status}, expected PAID"
  [[ "${has_paid_at}" == "true" ]] \
    || ff_fail "paid_at is missing"
  [[ "${paid_charge_count}" == "1" ]] \
    || ff_fail "found ${paid_charge_count} paid provider charges, expected exactly 1"
  [[ "${complete_charge_count}" == "1" ]] \
    || ff_fail "paid provider charge is missing its reference or processed timestamp"
  [[ "${new_order_notification_count}" == "1" ]] \
    || ff_fail "found ${new_order_notification_count} new-order admin notifications, expected exactly 1"
else
  [[ "${order_status}" == "PAYMENT_PENDING" ]] \
    || ff_fail "order status is ${order_status}, expected PAYMENT_PENDING"
  [[ "${payment_status}" == "PENDING" ]] \
    || ff_fail "payment status is ${payment_status}, expected PENDING"
  [[ "${has_paid_at}" == "false" ]] \
    || ff_fail "unpaid order unexpectedly has paid_at"
  [[ "${paid_charge_count}" == "0" ]] \
    || ff_fail "unpaid order has ${paid_charge_count} paid provider charges"
  [[ "${new_order_notification_count}" == "0" ]] \
    || ff_fail "unpaid order has ${new_order_notification_count} new-order admin notifications"
fi

printf 'Payment acceptance passed.\n'
printf '  environment: %s\n' "${ENVIRONMENT}"
printf '  order: %s\n' "${ORDER_ID}"
printf '  provider: %s\n' "${payment_method}"
printf '  order status: %s\n' "${order_status}"
printf '  payment status: %s\n' "${payment_status}"
printf '  paid provider charges: %s\n' "${paid_charge_count}"
printf '  new-order admin notifications: %s\n' "${new_order_notification_count}"
