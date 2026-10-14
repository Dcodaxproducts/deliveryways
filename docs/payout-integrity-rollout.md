# Payout integrity Phase 1 rollout

## Scope

Migration `20261014170000_add_payout_integrity_lifecycle` is additive. It adds payout operation identity, provider identity, lease/fencing, reconciliation state, release linkage, and bounded recovery indexes. The existing public routes remain valid; cancellation and reconciliation are additive.

## Before deploy

1. Back up the target database and verify restore metadata.
2. Resolve the deployed image to a source commit and prove release ancestry.
3. Run `scripts/backfill-payout-integrity.sql` as a dry-run. Quarantine every payout with more than one payout debit; do not automatically choose a transaction.
4. Confirm no migration is running and deploy the migration before application instances that write new lifecycle states.

## Rollout

1. Apply migrations with `prisma migrate deploy`.
2. Run the application with one worker first and inspect `NEEDS_RECONCILIATION`, expired `PROCESSING` leases, and provider-reference conflicts.
3. Reconcile ambiguous provider outcomes before releasing any reservation. Provider/network I/O must remain outside database transactions.
4. Scale workers only after duplicate webhook and stale-lease checks pass.

## Recovery

- `RESERVED`: funds are already debited and safe to retry or cancel.
- `PROCESSING` with an expired lease: a new worker may claim it; the durable provider idempotency key is reused.
- `NEEDS_RECONCILIATION`: poll the provider or accept a validated webhook. Never release based only on a timeout.
- `PROVIDER_SUCCEEDED`: call local completion; no additional wallet debit is allowed.
- `RELEASED`/`CANCELLED`: the release ledger operation is idempotent and must not be repeated with a different identity.

## Rollback

1. Stop new payout initiation while allowing reconciliation of committed provider transfers.
2. Drain or reconcile `PROCESSING`, `PROVIDER_SUCCEEDED`, and `NEEDS_RECONCILIATION` rows.
3. Roll the application back. Keep additive columns/indexes in place during emergency rollback; old code ignores them.
4. Only in a later maintenance window, after proving no rows use new states, drop the new indexes and columns. Keep PostgreSQL enum labels: removing labels requires an unsafe type/table rewrite.

## Performance

Reservation uses one wallet-scoped advisory lock, one indexed operation-key lookup, one conditional wallet update, one ledger insert, and one payout update. Reconciliation uses primary/compound indexed lookups. No mutation decision is cached. Lists remain bounded by existing pagination.
