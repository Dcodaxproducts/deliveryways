# Client-reported order and platform corrections design

**Spec:** `spec.md`

## Approach

- Extend the existing order list/report filters so created-date and schedule filters execute in PostgreSQL before count, pagination, and aggregation.
- Use one explicit eligible-status set for recognized revenue, COD/digital totals, and commission: CONFIRMED through completed states, excluding PAYMENT_PENDING, PLACED, CANCELLED, and REJECTED.
- Reuse the existing order report, currency formatter, financial report payment grouping, global tax-type JSON settings, subscription module registry, WinOrder permission module, receipt printing pipeline, and realtime notification hook.
- Extend the existing restaurant service-charge/payment configuration rather than creating a second unrelated fee system; persist fee payer explicitly and snapshot the charged amount on the order.
- Correct presentation at normalization/formatting boundaries so address coordinates and accounting records remain unchanged.

## Repository ownership

| Repository | Ownership |
| --- | --- |
| Backend | authoritative order filtering/aggregation, commission timing/base, fee ownership/calculation, tax default persistence, subscription/permission contracts |
| Restaurant Admin | default Today tab, cards/table, currency/COD labels, tax/address/printing presentation, subscription/WinOrder visibility, notification settings |
| Super Admin | durable tax default and online-payment-charge controls |
| Customer | customer-paid transaction-fee display/calculation contract, tax hiding, address/mobile presentation |

## Data changes

- Prefer extending existing restaurant/global settings JSON/columns where a compatible persisted fee setting already exists.
- If no compatible payer field exists, add the smallest tenant-scoped schema field with a drift-safe migration and tenant-safety verification.
- Orders retain their existing total and service-charge snapshot fields; customer-paid fees must be snapshotted so historical totals do not change when settings change.

## Failure handling

- Invalid date ranges or fee ownership values fail DTO validation.
- Missing configured currency falls back through the existing currency service only.
- Subscription/permission checks fail closed.
- Notification audio playback failure does not block order display or acknowledgement.
