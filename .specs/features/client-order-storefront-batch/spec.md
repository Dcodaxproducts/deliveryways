# Client order and storefront regression batch

## Scope

- R1: Pending orders never print. Confirmed orders auto-print only when the confirmed-order setting is enabled.
- R2: Confirmed and later active orders expose manual Print/Reprint independently of the auto-print toggle. Rejected and cancelled orders never print.
- R3: Tickets show delivery address, preorder time, subtotal, tax, delivery fee, service/other charges, tip, discounts, and total.
- R4: Delivery address capture requires house number, persists the selected address, displays it with the selected branch, and prefills checkout.
- R5: Restaurant admins can manually reorder categories and items; order details show item categories; selected customer categories scroll into view.
- R6: Super Admin can restrict payment methods per restaurant, and checkout displays only methods allowed by the platform, restaurant, and branch.
- R7: Applied tips use a compact accessible remove control.
- R8: Restaurant Admin can hide or show the storefront app-promotion section.

## Invariants

- Existing deployed production commits remain ancestors of every release branch.
- Payment method configuration remains Super Admin-only and tenant scoped.
- Existing restaurant branding without the new app-promotion flag continues to show the section.
- No schema migration is introduced for JSON-backed settings.

## Acceptance

- Each requirement has focused regression coverage.
- Type checking, tests, linting, and production builds pass in every changed repository.
- Changes are committed and pushed; deployment is explicitly excluded.
