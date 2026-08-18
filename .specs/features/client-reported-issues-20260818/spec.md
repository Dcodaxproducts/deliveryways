# DeliveryWays client-reported fixes — 2026-08-18

## Scope

This batch fixes ten reported order, subscription, catalog, tax, identifier, realtime, and address behaviors across the DeliveryWays backend and three web applications.

## Requirements

- `DW-CR-01` When an order reaches its successful terminal fulfillment status (`DELIVERED`, `PICKED_UP`, or `SERVED`), a still-pending order payment and its pending charge transaction must become `PAID` atomically. Existing paid/refunded/failed transactions must not be overwritten.
- `DW-CR-02` A Super Admin may cancel an order after fulfillment. Restaurant admins, branch admins, staff, delivery personnel, and customers retain the existing terminal-state restriction. A Super Admin may fully or partially refund an eligible paid charge from the Super Admin order details UI.
- `DW-CR-03` Customer-facing order summaries must not render tax lines or tax breakdown rows. Tax remains included in backend totals.
- `DW-CR-04` Restaurant/branch admin sessions must receive order status/payment updates in realtime. Accepting or otherwise changing an order on one device must invalidate the same scoped order data and dismiss the new-order popup on other devices.
- `DW-CR-05` Editing/switching an existing subscription must send only fields accepted by `UpdateTenantSubscriptionDto`; create-only ownership fields must never be sent.
- `DW-CR-06` Restaurants must expose a stable, unique numeric display number while retaining their internal string primary key. Super Admin restaurant selectors must show the numeric display number.
- `DW-CR-07` Every eligible newly placed order, scheduled or immediate, must emit the same `order.created` event and trigger the Restaurant Admin popup. Unpaid online orders remain gated until provider-confirmed success.
- `DW-CR-08` Manual menu-item ordering must persist and reload deterministically, including legacy items that currently share sort order zero.
- `DW-CR-09` The active platform tax type marked as default by Super Admin must be the initial tax selection for new Restaurant Admin menu items. Editing an item must preserve its stored selection.
- `DW-CR-10` Admin order delivery addresses must display German-style structured ordering: street and house/shop number together, postal code and city together, followed by region and country, without changing stored coordinates or delivery calculations.

## Invariants

- Tenant and restaurant access checks remain enforced.
- Provider-confirmed online payment and refund idempotency remain unchanged.
- Internal restaurant IDs remain stable; numeric display numbers are presentation identifiers only.
- Tax is hidden, not removed from pricing arithmetic.
- Realtime events are scoped to the existing restaurant and branch rooms.
- No production migration or deployment is part of this implementation task.

## Acceptance

Each requirement has focused regression coverage. All affected repositories pass type checks, builds, tests, lint, Prisma validation/migration proof where relevant, and diff checks before push.
