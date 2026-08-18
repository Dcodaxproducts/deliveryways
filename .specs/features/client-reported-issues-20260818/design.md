# Design

## Backend

- Complete order status and pending-payment settlement through one repository transaction.
- Publish `order.updated` from the existing notifications realtime service after lifecycle changes; reuse the current restaurant and branch rooms.
- Preserve normal terminal cancellation rules and add a role-specific Super Admin exception.
- Add `Restaurant.displayNumber` as an auto-incremented unique integer and return it through restaurant read contracts.
- Normalize menu-item ordering in the repository so a submitted manual order is followed by remaining restaurant items in their prior deterministic order.

## Restaurant Admin

- Use a stable toast ID per order. `order.created` creates/updates the popup; `order.updated` invalidates list/detail/notification caches and dismisses the popup once the order leaves `PLACED`.
- Keep the existing default-tax hydration and add direct regression coverage.
- Format structured delivery addresses without commas inside street/number and postal/city pairs.

## Super Admin

- Build separate create and update subscription payloads.
- Add explicit cancel and refund mutations/actions to order details, backed by existing API authorization and payment refund rules.
- Display `displayNumber` in restaurant selector metadata while continuing to submit the internal restaurant ID.

## Customer

- Keep totals unchanged and verify every rendered pricing-breakdown path filters tax rows.

## Failure behavior

- Order settlement is rolled back if either order or pending-transaction update fails.
- Refund remains limited to paid charge transactions and the refundable balance.
- Realtime failures never change committed order state.
- Numeric display-number migration is additive and leaves internal keys untouched.
