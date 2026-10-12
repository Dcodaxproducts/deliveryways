#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to a disposable scratch database}"
case "$DATABASE_URL" in *localhost*|*127.0.0.1*|*scratch*) ;; *) echo 'Refusing non-scratch DATABASE_URL' >&2; exit 2;; esac
npx prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF to_regclass('public.realtime_outbox_events') IS NULL THEN RAISE EXCEPTION 'outbox missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='orders_realtime_outbox') THEN RAISE EXCEPTION 'order trigger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='chat_threads_realtime_outbox') THEN RAISE EXCEPTION 'chat trigger missing'; END IF;
END $$;
SQL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261013003000_add_realtime_transactional_outbox/rollback.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261013003000_add_realtime_transactional_outbox/migration.sql
echo 'outbox forward/rollback/reapply passed'
