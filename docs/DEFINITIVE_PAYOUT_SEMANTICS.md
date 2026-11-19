# Definitive payout accounting and email delivery semantics

## Mid-month subscription changes

A monthly ledger is scoped by restaurant, subscription, and restaurant-local month. Finalized invoice snapshots and allocation rows are immutable.

- **Decrease:** already allocated commission and monthly fees are never refunded or rewritten. The effective ledger cap/fee target is floored at the amount already allocated, so database constraints remain valid. The newly configured lower terms are used to calculate the next invoice; while they remain at or below the allocated amount, the next deduction is zero.
- **Increase:** the effective target moves to the higher configured value. Future payouts may allocate only the remaining difference, using the current commission terms and payout cadence. Prior allocation snapshots remain unchanged.
- **New subscription:** a new subscription ID creates a distinct monthly ledger, even for the same restaurant and local month. No allocation carries across subscription IDs.
- **Plan/cadence change on the same subscription:** current terms govern future calculations. The ledger keeps the same allocation history and updates its effective target/cadence without modifying past invoices.

No Redis cache is used. Allocation is a bounded serializable PostgreSQL transaction with one ledger lookup/upsert, bounded allocation counts, one allocation insert, and one ledger update. Serialization conflicts retry at most three times.

## Payout email delivery states

The payout invoice and accounting allocation finalize before email delivery. Email failure cannot roll back or duplicate a payout.

- **PENDING / RETRY_WAIT:** eligible for an automatic claim.
- **PREPARING:** a worker owns a short lease but has not crossed the SMTP send boundary. An expired preparation lease is retryable.
- **SENDING:** the worker has crossed the SMTP send boundary. If the process fails or the lease expires, delivery becomes **UNKNOWN** because SMTP cannot guarantee provider-side deduplication.
- **UNKNOWN:** never selected for automatic resend. A super-admin must reconcile provider evidence.
- **SENT:** provider acceptance was recorded or an operator confirmed delivery.
- **FAILED:** bounded pre-send retries were exhausted.

Every attempt reuses the immutable provider key and Message-ID: `payout-invoice-<generatedInvoiceId>@deliveryways.app`.

### Operator reconciliation

- `GET /admin/package-plans/payouts/email-deliveries/reconciliation` lists up to 100 UNKNOWN deliveries.
- `POST /admin/package-plans/payouts/email-deliveries/:generatedInvoiceId/reconcile` accepts:
  - `DELIVERED`: record the provider-confirmed delivery without sending again.
  - `NOT_DELIVERED`: release the message to bounded automation after operator confirmation.
  - `RESEND`: explicitly release and immediately resend with the same provider key.

Reconciliation is fenced by an atomic `UNKNOWN`-state update, so concurrent operators cannot both release or confirm the same message.
