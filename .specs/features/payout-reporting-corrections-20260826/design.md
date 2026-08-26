# Payout and reporting corrections design

**Spec:** `spec.md`

## Approach

1. Replace the online-only payout-order query with the existing successful-order recognition contract and include immutable transaction-fee snapshots plus charge/refund transactions.
2. Calculate one restaurant payout summary in `PackagePlansService`: total successful order amount, platform-held amount, commission across all successful methods, restaurant-paid fees, VAT, and net payout.
3. Keep wallet-ledger balance as the hard upper bound in `PaymentsService`, and expose the complete summary from the existing restaurant-wallet endpoint used by both admin applications.
4. Correct Financial Report COD aggregation to use successful order statuses rather than `paymentStatus=PAID`.
5. Remove only the duplicate Order Management invoice-history surface; preserve billing invoice history under Reports.
6. Extend the existing customer-list filter contract with `isGuest`, which the API already supports.

## Calculation

For each successful order:

- recognized order amount = successful order total, limited by net provider collections for refunded provider-paid orders;
- commission = active plan commission formula over recognized order amount, respecting the remaining commission cap;
- restaurant fee = `transactionFeeAmount` only when `transactionFeePayer=RESTAURANT`;
- VAT = `(commission + restaurant fee) * vatPercentage / 100`.

Restaurant summary:

- total order amount = sum of recognized successful order totals across every payment method;
- platform-held amount = current wallet ledger / settled provider-funded amount;
- available payout = lesser of wallet ledger and calculated platform-held net, after commission, restaurant fees, VAT, and recorded previous payouts, clamped to zero.

## Repository ownership

| Repository       | Changes                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| API              | authoritative payout calculation, COD aggregation, wallet response, invoices, focused tests                           |
| Restaurant Admin | remove duplicate invoice tab, customer-type filter, explicit Today default, full payout/report cards and translations |
| Super Admin      | normalize and render the same net payout breakdown                                                                    |

## Failure handling

- A missing active plan produces zero commission/VAT while preserving fee and wallet math.
- Missing transaction-fee snapshots resolve to zero.
- Legacy `/orders?tab=invoice-history` resolves safely to Today's Orders.
- Branch-scoped reporting continues to expose only branch-scoped report totals; restaurant-wide wallet payout data is not exposed to branch-restricted users unless already authorized by the wallet endpoint.
