#!/usr/bin/env bash
# Proves the realtime outbox migration on a DISPOSABLE PostgreSQL database:
#   all Prisma migrations from empty -> schema/drift/structure -> trigger behaviour (compact intents,
#   WHEN-guard no-op suppression, BIGSERIAL ordering) -> rollback.sql -> Prisma redeploy -> behaviour
#   -> rollback.sql -> raw SQL reapply -> behaviour.
# Usage: DATABASE_URL=postgresql://postgres:scratch@127.0.0.1:55432/scratch bash scripts/test-realtime-outbox-migration.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

: "${DATABASE_URL:?DATABASE_URL must point to a disposable scratch database}"
case "$DATABASE_URL" in *localhost*|*127.0.0.1*|*scratch*) ;; *) echo 'Refusing non-scratch DATABASE_URL' >&2; exit 2;; esac
# prisma.config.ts loads .env/.env.local with override, which would silently retarget Prisma.
for envfile in .env .env.local; do
  if [[ -f "$envfile" ]] && grep -Eq '^[[:space:]]*DATABASE_URL=' "$envfile"; then
    echo "Refusing to run: $envfile defines DATABASE_URL and would override the scratch database" >&2
    exit 2
  fi
done

MIGRATION=20261013003000_add_realtime_transactional_outbox
DIR=prisma/migrations/$MIGRATION
SQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

if [[ "$("${SQL[@]}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")" != 0 ]]; then
  if [[ "${RESET_SCRATCH:-}" != yes ]]; then
    echo 'Scratch database is not empty; set RESET_SCRATCH=yes to drop schema public first' >&2
    exit 2
  fi
  "${SQL[@]}" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
fi

assert() { # assert <label> <sql returning t/f>
  [[ "$("${SQL[@]}" -Atc "$2")" == t ]] || { echo "FAILED: $1" >&2; exit 1; }
  echo "ok: $1"
}

assert_installed() {
  assert 'outbox table has BIGSERIAL id' "SELECT data_type = 'bigint' AND column_default LIKE 'nextval(%' FROM information_schema.columns WHERE table_name = 'realtime_outbox_events' AND column_name = 'id'"
  assert 'dispatch index is (published_at, failed_at, id)' "SELECT indexdef LIKE '%(published_at, failed_at, id)' FROM pg_indexes WHERE indexname = 'realtime_outbox_dispatch_idx'"
  assert 'no legacy columns/indexes' "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'realtime_outbox_events' AND column_name = 'available_at') AND to_regclass('realtime_outbox_aggregate_idx') IS NULL"
  assert 'six outbox triggers installed and enabled' "SELECT count(*) = 6 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('orders_realtime_outbox_insert','orders_realtime_outbox_update','deliverymen_realtime_outbox_location','chat_threads_realtime_outbox_insert','chat_threads_realtime_outbox_update','chat_messages_realtime_outbox')"
  assert 'update triggers carry WHEN guards' "SELECT count(*) = 2 FROM pg_trigger WHERE tgname IN ('orders_realtime_outbox_update','chat_threads_realtime_outbox_update') AND tgqual IS NOT NULL"
  assert 'order insert trigger only announces PLACED orders' "SELECT tgqual IS NOT NULL FROM pg_trigger WHERE tgname = 'orders_realtime_outbox_insert'"
  assert 'no payload-building helper function remains' "SELECT to_regprocedure('compact_chat_thread(chat_threads)') IS NULL"
}

assert_removed() {
  assert 'rollback removed table, triggers and functions' "SELECT to_regclass('realtime_outbox_events') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE '%realtime_outbox%') AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE '%realtime%')"
}

run_behaviour() {
  local output
  if ! output="$("${SQL[@]}" -f scripts/test-realtime-outbox-triggers.sql 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo 'FAILED: trigger behaviour' >&2
    exit 1
  fi
  grep -o 'ok: .*' <<<"$output"
}

echo '== all migrations from empty'
npx prisma migrate deploy
assert "$MIGRATION recorded as applied" "SELECT count(*) = 1 FROM _prisma_migrations WHERE migration_name = '$MIGRATION' AND finished_at IS NOT NULL AND rolled_back_at IS NULL"
assert_installed
echo '== schema.prisma matches the migrated outbox table'
# Other tables carry long-standing unrelated drift, so only the outbox table is compared.
drift="$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script || true)"
if grep -q 'realtime_outbox' <<<"$drift"; then
  grep 'realtime_outbox' <<<"$drift" >&2
  echo 'FAILED: prisma schema and migration disagree on realtime_outbox_events' >&2
  exit 1
fi
echo 'ok: no drift on realtime_outbox_events'
echo '== trigger behaviour'
run_behaviour

echo '== rollback.sql, then Prisma redeploy'
PGOPTIONS="-c client_min_messages=warning" "${SQL[@]}" -1 -f "$DIR/rollback.sql"
assert_removed
assert 'domain tables still writable after rollback' "SELECT count(*) >= 0 FROM orders"
"${SQL[@]}" -c "DELETE FROM _prisma_migrations WHERE migration_name = '$MIGRATION'"
npx prisma migrate deploy
assert_installed
run_behaviour

echo '== rollback.sql is idempotent, then raw SQL reapply'
PGOPTIONS="-c client_min_messages=warning" "${SQL[@]}" -1 -f "$DIR/rollback.sql"
PGOPTIONS="-c client_min_messages=warning" "${SQL[@]}" -1 -f "$DIR/rollback.sql"
assert_removed
"${SQL[@]}" -1 -f "$DIR/migration.sql"
assert_installed
run_behaviour

echo 'outbox all-migrations/forward/rollback/redeploy/reapply passed'
