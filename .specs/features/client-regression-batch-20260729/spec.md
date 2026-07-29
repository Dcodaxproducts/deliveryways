# Client Regression Batch — 2026-07-29

## Problem Statement

Restaurant staff still encounter inconsistent scope/permission failures, and several
restaurant-management, POS, payout, storefront, gift-card, and localization flows
do not match the client contract. The batch must correct shared contracts rather
than adding endpoint-specific bypasses.

## Goals

- Make staff Order Management reliable within assigned restaurant/branch scope.
- Make Deal item customization complete for category-selected items.
- Make POS checkout usable end to end for walk-in, guest, and existing customers.
- Centralize payout-provider configuration in Super Admin with encrypted secrets.
- Align storefront fulfillment pricing, Gift Cards, and German localization.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Cross-tenant staff access | Staff must remain constrained to assigned owner/restaurant/branch scope. |
| Offline Gift Card purchase | Gift Cards are online-payment-only. |
| Returning stored provider secrets in APIs | Secrets remain write-only and masked in UI. |
| Production deployment | Requires a separate explicit production operation. |

## P1 User Stories and Acceptance Criteria

### Staff orders and permissions

1. **RBAC-01 Order detail** — WHEN staff with Order Management opens an order from a list they are allowed to see THEN the order detail SHALL load.
2. **RBAC-02 Order status** — WHEN authorized staff updates an allowed order through a valid transition THEN the update SHALL succeed.
3. **RBAC-03 Order scope** — WHEN staff requests an order outside assigned restaurant/branch scope THEN the API SHALL deny access.
4. **RBAC-04 Complete Order Management rights** — WHEN staff has Order Management THEN list, detail, stats, trend, status, and order operational actions SHALL use that permission while preserving assignment scope.
5. **RBAC-05 Employee permissions** — WHEN an employee is created or edited THEN selected role/module permissions SHALL govern the same grouped UI/API modules.

### Deal customization

6. **DEAL-01 Category item options** — WHEN a category-selected Deal item has variations/modifiers/add-ons THEN selecting or expanding it SHALL load and display those options.
7. **DEAL-02 Deal cart contract** — WHEN configured Deal choices are added THEN selected variations/modifiers and quantities SHALL reach quote, checkout, and order detail.

### Branch delivery configuration

8. **BRANCH-01 Decimal delivery values** — WHEN an admin enters radius/distance or delivery-fee values with decimal dot or comma THEN the form SHALL accept and persist the decimal value without truncation.

### POS

9. **POS-01 Default branch** — WHEN POS opens and a Main Branch exists in the allowed scope THEN it SHALL be selected automatically; otherwise the first allowed branch SHALL be selected.
10. **POS-02 Customer lookup** — WHEN staff searches by customer name/email/phone/customer ID or previous Order ID THEN matching customers SHALL be distinguishable and selectable.
11. **POS-03 Guest contact** — WHEN a POS order requires guest email/phone THEN the checkout UI SHALL provide those inputs and validate them at submission.
12. **POS-04 Checkout** — WHEN a valid POS cart is submitted THEN quote, checkout, payment method, contact, address/order type, and final order response SHALL complete without contract mismatch.

### Employee UX

13. **EMP-01 Password visibility** — WHEN creating an employee THEN the generated/entered password SHALL have an explicit show/hide control.
14. **EMP-02 Role editing** — WHEN editing an employee role/permissions THEN the saved scope SHALL be reflected in list and subsequent authorization.

### Payout configuration and Super Admin security

15. **PAY-01 Restaurant Admin cleanup** — Restaurant Admin SHALL NOT expose Stripe/PayPal automated payout-provider credentials/configuration.
16. **PAY-02 Per-restaurant providers** — Super Admin SHALL configure and manage Stripe/PayPal payout settings for each restaurant.
17. **PAY-03 Global providers** — Super Admin SHALL configure global Stripe and PayPal platform credentials.
18. **PAY-04 Secret handling** — Provider API keys/passwords SHALL be encrypted at rest, never returned in plaintext, masked in UI, and replaceable without re-entering unchanged secrets.
19. **AUTH-01 Super Admin password** — Super Admin SHALL provide a Change Password action using the authenticated password-change API.

### Storefront and Gift Cards

20. **HOME-01 Fulfillment pricing** — WHEN the customer switches Pickup/Delivery THEN displayed product/cart prices SHALL update for that order type.
21. **HOME-02 Address handoff** — WHEN Delivery address is selected on Home THEN checkout SHALL reuse it until the customer explicitly changes it.
22. **GIFT-01 Homepage visibility** — WHEN Gift Cards are enabled THEN the homepage SHALL display them.
23. **GIFT-02 Guest purchase** — WHEN a guest selects a Gift Card THEN they SHALL be able to purchase using required contact details.
24. **GIFT-03 Online-only payment** — Gift Card purchase SHALL allow only enabled online payment methods and SHALL reject wallet/offline methods.

### Localization and display

25. **I18N-01 Weekly hours** — German “View Weekly Hours” SHALL display German weekday labels.
26. **I18N-02 Add-ons labels** — German UI SHALL translate “Item Add-ons (Selected)”, “Qty”, and “Cart Summary → Add-ons”.
27. **I18N-03 Distance display** — Homepage restaurant distance SHALL use a meaningful formatted unit/value and SHALL not show misleading `1m away`.
28. **I18N-04 Changed surfaces** — All user-visible copy touched by this batch SHALL use EN/DE translation keys with parity checks.

## Edge Cases

- WHEN staff has access to multiple restaurants THEN an order detail SHALL be
  allowed only if its restaurant is in the assignment.
- WHEN a staff role is branch-scoped THEN order status changes outside that
  branch SHALL remain denied.
- WHEN multiple customers share a name THEN POS results SHALL show additional
  identifying fields without exposing secrets.
- WHEN a provider secret is already stored THEN a masked placeholder SHALL not
  overwrite it unless a new secret is submitted.
- WHEN no online Gift Card payment method is enabled THEN purchase SHALL be
  unavailable with an actionable message.
- WHEN decimal input uses `1,5` THEN it SHALL normalize to `1.5` for the API.

## Requirement Traceability

| Requirement | Status |
| --- | --- |
| RBAC-01..05 | In Tasks |
| DEAL-01..02 | In Tasks |
| BRANCH-01 | In Tasks |
| POS-01..04 | In Tasks |
| EMP-01..02 | In Tasks |
| PAY-01..04 | In Tasks |
| AUTH-01 | In Tasks |
| HOME-01..02 | In Tasks |
| GIFT-01..03 | In Tasks |
| I18N-01..04 | In Tasks |

## Success Criteria

- Focused regression tests cover every changed contract.
- Backend, Restaurant Admin, Customer, and Super Admin proof surfaces pass.
- Each affected repository is committed and pushed on the cumulative branch.
