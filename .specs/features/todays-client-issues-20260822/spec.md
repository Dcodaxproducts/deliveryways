# DeliveryWay Today's Client Issues — Specification

## Problem Statement

Restaurant staff, customers, and super admins currently see incomplete or stale financial and catalog information across Orders, checkout, invoices, subscriptions, and menu items. The fixes must preserve tenant/restaurant scope, make authoritative backend values visible, and avoid retroactively changing historical settlement terms.

## Goals

- Make staff-authorized Orders and invoice data visible consistently.
- Make checkout fees and tips accurate and usable.
- Make invoice, subscription, wallet, and item-list behavior deterministic.

## Out of Scope

- Production or development deployment.
- Retroactively rewriting paid orders under a newly selected subscription plan.
- Replacing the existing invoice generation and settlement architecture.

## P1 User Stories and Acceptance Criteria

### ACCESS-01 — Staff reporting scope

WHEN staff can read Order Management THEN order summary/report reads and ORDER invoice history SHALL be authorized with the same permission and remain tenant/restaurant/branch scoped.

WHEN staff can read Reports & Payouts THEN subscription/payout invoice history SHALL return the scoped generated invoices instead of a permission-derived empty state.

### ORDER-01 — Default order date

WHEN Orders opens without an explicit tab THEN Today's Orders SHALL be selected and the table and cards SHALL use the same local-day range.

### PAY-01 — Online payment commission

WHEN an online paid order is included in restaurant wallet/payout totals THEN the configured active-plan commission SHALL be deducted exactly once; cash/card-on-delivery orders SHALL not create an online payout commission.

WHEN a plan is switched THEN the wallet response SHALL expose the active plan name/model and commission terms used by current payout calculation; historical payment records SHALL not be mutated.

### CHECKOUT-01 — Customer transaction fee

WHEN a customer-paid processing fee is enabled and an online method is selected THEN checkout SHALL preserve the quoted fee fields, display the fee line, and include it in payable amount.

### CHECKOUT-02 — Tip presets

WHEN checkout is editable THEN €1, €2, and €3 actions SHALL apply the selected tip immediately; Custom SHALL reveal a validated non-negative input; the active tip SHALL be removable.

### INVOICE-01 — Generated invoice view

WHEN a super admin clicks View on a generated invoice THEN its authorized PDF SHALL open without forcing a download and the download activity SHALL be recorded.

### INVOICE-02 — Subscription invoice presentation

WHEN a subscription invoice is opened THEN it SHALL present identity, billing details, commission/VAT, totals, amount due, and email/PDF actions in the supplied visual hierarchy, using invoice snapshot values.

### SETTINGS-01 — Remove obsolete transaction settings

WHEN Restaurant Admin opens platform settings THEN obsolete default transaction and hybrid transaction percentage inputs SHALL not be rendered or submitted; restaurant payment-processing fee settings remain authoritative.

### ITEMS-01 — Complete stable item list

WHEN the Items page loads multiple pages THEN every page SHALL be loaded once in sequence without gaps, search SHALL not be required to reveal missing items, and ordering SHALL be stable.

WHEN an item is duplicated THEN its sort order SHALL be after all existing restaurant items and it SHALL appear at the bottom after refresh.

## Edge Cases

- Zero or restaurant-paid processing fees remain hidden from the customer total.
- Popup-blocked invoice views report a visible error without losing the current page.
- Concurrent item loading cannot increment past the next page.
- Commission percentage, fixed commission, and cap calculations remain rounded to two decimals and never produce a negative payout.

## Traceability

| Requirement | Status |
|---|---|
| ACCESS-01 | In Tasks |
| ORDER-01 | In Tasks |
| PAY-01 | In Tasks |
| CHECKOUT-01 | In Tasks |
| CHECKOUT-02 | In Tasks |
| INVOICE-01 | In Tasks |
| INVOICE-02 | In Tasks |
| SETTINGS-01 | In Tasks |
| ITEMS-01 | In Tasks |

