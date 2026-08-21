# Client-reported order and platform corrections specification

## Problem

DeliveryWay currently exposes inconsistent order counts, empty schedule-filter pages, late/incomplete revenue and commission totals, unstable global tax defaults, incomplete subscription/permission enforcement, and several customer/admin presentation defects. The requested batch must keep API, Restaurant Admin, Super Admin, and Customer behavior consistent without changing tenant isolation or production data during implementation.

## P1 requirements

| ID | Acceptance criterion |
| --- | --- |
| CR21-01 | WHEN Restaurant Admin opens All Orders or Today's Orders THEN PAYMENT_PENDING orders SHALL be excluded from the rows, counts, and summary cards; the dedicated Pending Payments tab SHALL continue to show them. |
| CR21-02 | WHEN Restaurant Admin opens Orders without an explicit tab THEN Today's Orders SHALL be selected and SHALL show orders created during the restaurant's current day, excluding PAYMENT_PENDING orders. |
| CR21-03 | WHEN an order schedule/date filter is active THEN filtering SHALL occur before database pagination and report aggregation, so every advertised page contains matching rows unless the dataset changes concurrently. |
| CR21-04 | WHEN eligible orders are CONFIRMED or later (excluding cancelled/rejected/payment-pending) THEN revenue, average, COD, digital-payment, and commission totals SHALL include their full order total without waiting for delivery. |
| CR21-05 | WHEN All Orders or Today's Orders summary cards render THEN they SHALL include COD total and digital/online total, formatted with the configured currency rather than a hard-coded dollar symbol. |
| CR21-06 | WHEN order tables render on a narrow viewport THEN the table SHALL remain readable through horizontal scrolling and mobile item titles/descriptions SHALL use legible emphasized typography. |
| CR21-07 | WHEN German locale is active THEN COD SHALL use the established German cash-on-delivery label consistently. |
| CR21-08 | WHEN order details/summary render THEN tax SHALL be hidden in the specified customer and Restaurant Admin surfaces while stored tax and total calculations remain unchanged. |
| CR21-09 | WHEN Super Admin changes the global default tax type THEN exactly that type SHALL remain default after refetch and Restaurant Admin menu forms SHALL use it until Super Admin changes it again. |
| CR21-10 | WHEN online-payment charge settings are configured THEN the restaurant SHALL choose restaurant-paid or customer-paid ownership; customer-paid charges SHALL be displayed and included exactly once in quote/order totals, while restaurant-paid charges SHALL not increase the customer total. |
| CR21-11 | WHEN a restaurant subscription changes THEN actual module/feature access SHALL reflect the active plan, not only the displayed plan badge. |
| CR21-12 | WHEN a staff role is granted WinOrder Integration THEN its navigation and API access SHALL be available; without the permission both SHALL remain denied. |
| CR21-13 | WHEN a customer-selected address is displayed THEN street/house number, postal code/city, state, and country SHALL use their correct fields; coordinates SHALL remain unchanged for distance calculations. |
| CR21-14 | WHEN an order is printed automatically or manually THEN the supported receipt layout SHALL render without clipping/overflow and preserve correct totals, address, and item typography. |
| CR21-15 | WHEN Restaurant Admin configures order notification audio THEN once/repeat behavior SHALL persist and the provided `mixkit-bell-notification-933` asset SHALL be used. |

## Invariants and out of scope

- All tenant-scoped reads/writes remain within existing repository/tenant-extension boundaries.
- No production deployment, migration application, or live data rewrite is authorized by this implementation batch.
- Stored tax values remain available for accounting even where the UI hides the tax line.
- Currency is resolved from the existing platform/restaurant currency contract; no display surface may introduce a literal `$` for monetary values.
- Transaction fees are never double-counted and commission is based on the full eligible order total regardless of payment method.

## Traceability

CR21-01 through CR21-15 are mapped in `tasks.md`; status progresses Pending -> Implementing -> Verified.
