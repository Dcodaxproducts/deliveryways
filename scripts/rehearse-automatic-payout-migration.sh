#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="deliveryways-auto-payout-migration-$$"
forward="$repo_root/prisma/migrations/20261120113000_automatic_stripe_payouts/migration.sql"
rollback="$repo_root/prisma/migrations/20261120113000_automatic_stripe_payouts/rollback.sql"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_USER=postgres postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null

create_db() { docker exec "$container" createdb -U postgres "$1"; }
sql() { docker exec "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -Atqc "$2"; }
apply_file() { docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" < "$2" >/dev/null; }
apply_before_target() {
  local db="$1"
  while IFS= read -r file; do apply_file "$db" "$file"; done < <(
    find "$repo_root/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort |
      awk '/20261120113000_automatic_stripe_payouts/ { exit } { print }'
  )
}
assert_eq() {
  [[ "$1" == "$2" ]] || { echo "FAIL: $3 (expected '$2', got '$1')" >&2; exit 1; }
  echo "PASS: $3"
}

create_db lifecycle
apply_before_target lifecycle
apply_file lifecycle "$forward"
assert_eq "$(sql lifecycle "SELECT to_regclass('public.automatic_payout_transfers') IS NOT NULL")" t "forward creates durable payout table"
assert_eq "$(sql lifecycle "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='restaurant_wallet_accounts' AND column_name='reserved_payout_balance'")" 1 "forward creates reservation balance"
assert_eq "$(sql lifecycle "SELECT COUNT(*) FROM pg_indexes WHERE indexname='automatic_payout_transfers_restaurant_active_key' AND indexdef LIKE '%PREPARING%' AND indexdef LIKE '%UNKNOWN%'")" 1 "forward creates per-restaurant execution fence"
apply_file lifecycle "$rollback"
assert_eq "$(sql lifecycle "SELECT to_regclass('public.automatic_payout_transfers') IS NULL")" t "empty rollback removes payout table"
assert_eq "$(sql lifecycle "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='restaurant_wallet_accounts' AND column_name='reserved_payout_balance'")" 0 "empty rollback removes reservation balance"
apply_file lifecycle "$forward"
assert_eq "$(sql lifecycle "SELECT to_regclass('public.automatic_payout_transfers') IS NOT NULL")" t "forward reapplies after rollback"

create_db refusal
apply_before_target refusal
apply_file refusal "$forward"
sql refusal "SET session_replication_role = replica; INSERT INTO automatic_payout_transfers (id, tenant_id, restaurant_id, provider, state, amount, currency, idempotency_key, updated_at) VALUES ('safety-1','tenant-1','restaurant-1','STRIPE','UNKNOWN',10,'EUR','safety-key',CURRENT_TIMESTAMP); SET session_replication_role = origin;"
set +e
refusal_output="$(apply_file refusal "$rollback" 2>&1)"; refusal_status=$?
set -e
[[ $refusal_status -ne 0 ]] || { echo "FAIL: rollback unexpectedly removed active safety records" >&2; exit 1; }
[[ "$refusal_output" == *"rollback refused: automatic payout safety records exist"* ]] || { echo "$refusal_output" >&2; exit 1; }
assert_eq "$(sql refusal "SELECT COUNT(*) FROM automatic_payout_transfers WHERE id='safety-1'")" 1 "rollback refusal preserves safety row"
assert_eq "$(sql refusal "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='restaurant_wallet_accounts' AND column_name='reserved_payout_balance'")" 1 "rollback refusal preserves reservation schema"

echo "PostgreSQL 16 automatic payout migration rehearsal passed."
