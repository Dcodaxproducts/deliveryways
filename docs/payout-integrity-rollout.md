# Payout integrity Phase 1 rollout

## Scope

Migration `20261014170000_add_payout_integrity_lifecycle` is metadata-only: enum labels and nullable/additive lifecycle columns. It contains no historical UPDATE and no hot-table index build. Application reservation is wallet-serialized and enforces both current ledger balance and post-deduction entitlement after outstanding uninvoiced payouts.

## Before deploy

1. Back up the database and verify restore metadata.
2. Resolve the deployed image commit and prove it is an ancestor of the release.
3. Run the legacy audit section of `scripts/backfill-payout-integrity.sql`. Zero-row, multiple-row, wrong-wallet, wrong-tenant, wrong-restaurant, wrong-currency, zero/non-negative, and wrong-amount matches are quarantined; never synthesize or choose a debit.
4. Confirm no migration or concurrent index build is active.

## Online rollout

1. Apply Prisma migrations: `npx prisma migrate deploy`.
2. Outside an explicit transaction, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/create-payout-indexes-concurrently.sql`. Monitor `pg_stat_progress_create_index` and retry only invalid/failed indexes after inspection.
3. Run one bounded backfill batch at a time: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-payout-integrity.sql`. It uses `FOR UPDATE SKIP LOCKED`; repeat until `updated_rows = 0`.
4. Re-run the audit and require zero unsafe rows, or explicitly quarantine and reconcile every returned payout.
5. Start one payout worker, inspect reconciliation and expired leases, then scale workers.

## Recovery

- `RESERVED`: funds are already debited; retry or cancel through the lifecycle API.
- `PROCESSING` with expired lease: reclaim with the durable provider idempotency key.
- `NEEDS_RECONCILIATION`: poll provider or accept a validated webhook; never release on timeout alone.
- `PROVIDER_SUCCEEDED`: finish local completion without another debit.
- `RELEASED`/`CANCELLED`: release is idempotent and must not be repeated under another identity.

## Performance and correctness gates

- Availability is computed by indexed PostgreSQL aggregates; successful orders and nested payment transactions are not materialized in Node.js.
- Monthly invoice history is fetched once for the full range, avoiding month-by-month N+1 queries.
- Reservation holds the wallet financial-ledger lock while checking current wallet scope/currency, uninvoiced outstanding payout amounts, and entitlement. Ledger balance and entitlement are independent ceilings, so reservations are not double-subtracted.
- Validate with high-cardinality result-equivalence/query-count tests and `EXPLAIN (ANALYZE, BUFFERS)` on representative tenant cardinality.

## Rollback

Stop new payout initiation, reconcile committed provider transfers, and roll back application instances. Keep additive columns, enum labels, and valid concurrent indexes during emergency rollback. Removing enum labels or lifecycle data is not an online rollback.

## Refund lifecycle and gift-card fulfillment integrity

Migration: `20261014193000_add_refund_lifecycle`.

### Rollout

1. Deploy the additive migration before application code. It adds nullable lifecycle/fencing columns, recovery indexes, the `REFUND_RELEASE` ledger type, and removes the obsolete one-entry-per-payout index so typed payout debit/release entries can coexist.
2. The migration adopts completed legacy refunds as `COMPLETED`. Pending legacy refunds become `LEGACY_QUARANTINED`; they must never be submitted to a provider automatically.
3. The preceding `20261014190000_add_gift_card_source_payment` migration owns the unique gift-card source-payment identity and its bounded legacy adoption.
4. Deploy application workers/API, then monitor counts by `refund_lifecycle_status`, especially `NEEDS_RECONCILIATION` and `LEGACY_QUARANTINED`.

### Refund state contract

- `RESERVED`: restaurant liability was debited atomically with refund reservation.
- `PROCESSING`: one lease/token holder may call the provider with the durable provider idempotency key.
- `PROVIDER_SUCCEEDED`: provider success is durable; retries perform only local completion.
- `NEEDS_RECONCILIATION`: timeout/transport outcome is ambiguous; liability remains reserved. Reconcile from a signed provider callback or provider lookup before changing state.
- `FAILED_RELEASED`: definitive provider failure; liability was released through an idempotent `REFUND_RELEASE` ledger operation.
- `COMPLETED`: local refund/order/benefit finalization completed.
- `LEGACY_QUARANTINED`: pre-migration pending operation with unknown provider commitment.

Cancellation is allowed only while `RESERVED`; never release a `PROCESSING`, `PROVIDER_SUCCEEDED`, or reconciliation reservation without definitive provider evidence. A stale lease holder cannot persist success or release liability because updates are fenced by its token.

### Reconciliation checks

Validate provider, source charge/capture, provider refund identity, tenant, restaurant, amount, and currency before adopting callbacks. For Stripe, `refund.updated` metadata carries the refund transaction and scope. Duplicate callbacks are safe: provider success and completion are idempotent. Quarantined legacy rows require provider-console evidence and a recorded operator decision before manual state repair.

### Rollback

Application rollback is safe because all new columns are nullable and public `PaymentStatus` values remain unchanged. Do not drop lifecycle columns, enum values, or unique indexes until all in-flight and quarantined refunds are resolved. Never roll back by releasing reservations in bulk.
