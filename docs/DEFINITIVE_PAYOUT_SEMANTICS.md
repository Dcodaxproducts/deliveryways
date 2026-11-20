# Definitive payout accounting and email delivery semantics

## Mid-month subscription changes

A monthly ledger row retains its subscription identity for audit, while commission-cap and monthly-fee consumption are fenced and aggregated by restaurant and restaurant-local month. Finalized invoice snapshots and allocation rows are immutable.

- **Decrease:** already allocated commission and monthly fees are never refunded or rewritten. The effective ledger cap/fee target is floored at the amount already allocated, so database constraints remain valid. The newly configured lower terms are used to calculate the next invoice; while they remain at or below the allocated amount, the next deduction is zero.
- **Increase:** the effective target moves to the higher configured value. Future payouts may allocate only the remaining difference, using the current commission terms and payout cadence. Prior allocation snapshots remain unchanged.
- **New subscription:** a replacement subscription ID creates a distinct audit ledger, but all ledgers for the same restaurant-local month contribute to the same commission cap, fee target, and fee-opportunity count. A replacement cannot grant a second cap or monthly fee.
- **Plan/cadence change on the same subscription:** current terms govern future calculations. The ledger keeps the same allocation history and updates its effective target/cadence without modifying past invoices.

No Redis cache is used. Allocation is a bounded serializable PostgreSQL transaction with one restaurant-month aggregate, one ledger upsert, bounded allocation counts, one allocation insert, and one ledger update. Serialization conflicts retry at most three times.

## Automatic provider transfer

Scheduled and Superadmin-initiated provider payouts use the same durable transfer executor. Scheduled transfers use the generated invoice ID; manual transfers use a database-unique hash of restaurant, provider, and client idempotency key. The executor atomically reserves wallet capacity before crossing the provider boundary. A PostgreSQL partial unique index allows only one PREPARING, SENDING, or UNKNOWN transfer per restaurant, so manual and automatic execution cannot race.

- Approved and enabled Stripe configurations transfer automatically; explicit Superadmin payouts may use approved Stripe or PayPal configurations.
- Reservation increments reserved_payout_balance without overwriting wallet balance. Delivery atomically decrements both balance and reservation exactly once; terminal pre-submission failure releases only the reservation.
- Expired PREPARING leases recover only when the observed claim token and expiry still match. Expired SENDING leases become UNKNOWN.
- PREPARING performs reservation and credential/destination validation. SENDING is recorded immediately before the external call.
- Once submission starts, a timeout, provider error, or provider-success/database-failure becomes UNKNOWN; automation never resends it and retains the reservation pending reconciliation.
- No Redis cache is used. Identity, claims, restaurant serialization, reservations, and reconciliation are PostgreSQL-backed.

### Provider payout reconciliation

- GET /payments/provider-payouts/reconciliation lists up to 100 UNKNOWN transfers for Superadmins.
- POST /payments/provider-payouts/:id/reconcile accepts:
  - DELIVERED: provider evidence and a unique provider reference complete the wallet debit exactly once.
  - NOT_DELIVERED: provider proof releases the reservation exactly once and terminally fails the attempt.
  - RESEND: only provider proof that no submission occurred releases the reservation and permits a new attempt with the same deterministic provider key.

Rollback refuses to remove payout safety tables while any transfer row exists.

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
