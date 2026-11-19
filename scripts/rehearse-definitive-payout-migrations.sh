#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="deliveryways-payout-migration-rehearsal-$$"
forward="$repo_root/prisma/migrations/20261119173000_final_payout_audit/migration.sql"
rollback="$repo_root/prisma/migrations/20261119173000_final_payout_audit/rollback.sql"
ledger="$repo_root/prisma/migrations/20261119130000_payout_monthly_ledger/migration.sql"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_USER=postgres postgres:16 >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ $ready -eq 1 ]] || { echo "PostgreSQL 16 rehearsal container did not become ready" >&2; exit 1; }

create_db() { docker exec "$container" createdb -U postgres "$1"; }
sql() { docker exec "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -Atqc "$2"; }
apply_file() { docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" < "$2" >/dev/null; }
apply_pre_candidate() {
  local db="$1"
  while IFS= read -r file; do apply_file "$db" "$file"; done < <(
    find "$repo_root/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort |
      awk '/20261119130000_payout_monthly_ledger/ { exit } { print }'
  )
}
assert_eq() {
  [[ "$1" == "$2" ]] || { echo "FAIL: $3 (expected '$2', got '$1')" >&2; exit 1; }
  echo "PASS: $3"
}

create_db clean_lineage
while IFS= read -r file; do apply_file clean_lineage "$file"; done < <(find "$repo_root/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort)
assert_eq "$(sql clean_lineage "SELECT to_regclass('public.restaurant_payout_monthly_ledgers') IS NOT NULL")" t "clean full lineage"
assert_eq "$(sql clean_lineage "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'payout_invoice_email_outbox_reconciliation_state_check'")" 1 "clean UNKNOWN-state constraint"

create_db pre_candidate
apply_pre_candidate pre_candidate
assert_eq "$(sql pre_candidate "SELECT to_regclass('public.restaurant_payout_monthly_ledgers') IS NULL")" t "pre-candidate boundary"
apply_file pre_candidate "$ledger"
apply_file pre_candidate "$forward"
assert_eq "$(sql pre_candidate "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'payout_invoice_email_outbox' AND column_name = 'reconciliation_required_at'")" 1 "candidate applies over predecessor"

create_db duplicate_data
apply_pre_candidate duplicate_data
sql duplicate_data "INSERT INTO generated_invoices (id, invoice_number, kind, source_key, snapshot, updated_at) VALUES ('dup-1','DUP-1','ORDER','duplicate-source','{}',CURRENT_TIMESTAMP),('dup-2','DUP-2','ORDER','duplicate-source','{}',CURRENT_TIMESTAMP)"
set +e
duplicate_output="$(apply_file duplicate_data "$ledger" 2>&1)"; duplicate_status=$?
set -e
[[ $duplicate_status -ne 0 ]] || { echo "FAIL: duplicate-data preflight unexpectedly succeeded" >&2; exit 1; }
[[ "$duplicate_output" == *"Cannot add generated_invoices(kind, source_key) uniqueness"* ]] || { echo "$duplicate_output" >&2; exit 1; }
assert_eq "$(sql duplicate_data "SELECT to_regclass('public.restaurant_payout_monthly_ledgers') IS NULL")" t "duplicate preflight rolls back migration"
assert_eq "$(sql duplicate_data "SELECT to_regclass('public.generated_invoices_kind_source_key_key') IS NULL")" t "duplicate preflight leaves no partial unique index"

create_db rollback_ok
apply_pre_candidate rollback_ok; apply_file rollback_ok "$ledger"; apply_file rollback_ok "$forward"; apply_file rollback_ok "$rollback"
assert_eq "$(sql rollback_ok "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'payout_invoice_email_outbox' AND column_name = 'delivery_state'")" 0 "rollback removes delivery state"
assert_eq "$(sql rollback_ok "SELECT to_regclass('public.payout_invoice_email_outbox_dispatch_idx') IS NOT NULL")" t "rollback restores predecessor dispatch index"

create_db injected_forward
apply_pre_candidate injected_forward; apply_file injected_forward "$ledger"
tmp_forward="$(mktemp)"; sed '/^COMMIT;$/i SELECT 1 / 0;' "$forward" > "$tmp_forward"
set +e; apply_file injected_forward "$tmp_forward" >/dev/null 2>&1; injected_status=$?; set -e; rm -f "$tmp_forward"
[[ $injected_status -ne 0 ]] || { echo "FAIL: injected forward failure unexpectedly succeeded" >&2; exit 1; }
assert_eq "$(sql injected_forward "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'restaurant_payout_monthly_ledgers' AND column_name = 'payout_cycle'")" 0 "forward migration is atomic on injected failure"
assert_eq "$(sql injected_forward "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'payout_invoice_email_outbox' AND column_name = 'delivery_state'")" 0 "forward failure leaves no partial outbox state"

create_db injected_rollback
apply_pre_candidate injected_rollback; apply_file injected_rollback "$ledger"; apply_file injected_rollback "$forward"
tmp_rollback="$(mktemp)"; sed '/^COMMIT;$/i SELECT 1 / 0;' "$rollback" > "$tmp_rollback"
set +e; apply_file injected_rollback "$tmp_rollback" >/dev/null 2>&1; injected_status=$?; set -e; rm -f "$tmp_rollback"
[[ $injected_status -ne 0 ]] || { echo "FAIL: injected rollback failure unexpectedly succeeded" >&2; exit 1; }
assert_eq "$(sql injected_rollback "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'payout_invoice_email_outbox' AND column_name = 'delivery_state'")" 1 "rollback is atomic on injected failure"
assert_eq "$(sql injected_rollback "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'restaurant_payout_monthly_ledgers' AND column_name = 'payout_cycle'")" 1 "rollback failure preserves forward schema"

echo "PostgreSQL 16 definitive payout migration rehearsal passed."
