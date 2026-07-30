# Design — DeliveryWay client regression follow-up

## Customer storefront

- Preserve `item.category.id` while normalizing full deal-scoped item details. The chooser can then merge summaries and details without losing category membership.
- Replace hardcoded option-state text with message keys in the item detail, restaurant card, signature selection, branch header, and branch selector surfaces.
- Keep distance calculation in the existing helper, but localize the suffix at the rendering boundary.

## POS and addresses

- Extend order quote responses with the same effective payment methods already checked during order creation. The cart response already embeds the quote, so POS consumes that authoritative list instead of calling privileged payment-management APIs.
- Add optional target `customerId` and `branchId` fields to address creation. Reuse the address list scope resolver so admin create and admin list have identical tenant/restaurant/branch boundaries.
- Add a POS mutation that creates the registered customer address and invalidates the customer-address query.

## Staff branch access

- Convert branch write authorization to an asynchronous check.
- For staff, resolve the active role, verify a Branch Management write operation, then confirm the target branch belongs to the resolved assignment scope.
- Keep existing Super Admin, Business Admin, and Branch Admin checks unchanged.

## Employee stats and edit form

- Add `totalRoles` to the employee stats contract and count non-deleted roles within the dashboard tenant/restaurant/branch scope.
- Keep `roleBreakdown` unchanged because it represents assigned employees.
- Resolve the edit password from safe plaintext response aliases only; never use the hashed `password` field.

## Navigation

- Route the Order Management “Invoice History” child to `/orders?tab=invoice-history` and authorize it with `order-management`.

## Data and security

- No schema changes.
- Address creation preserves the customer’s tenant ownership.
- Staff branch writes remain permission- and assignment-scoped.
- Effective payment methods come from the same platform/restaurant/branch intersection enforced at checkout.

