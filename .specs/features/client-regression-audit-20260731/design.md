# Design

## Release shape

Use the five isolated worktrees created from the currently deployed commits:
backend, Restaurant Admin, customer storefront, Super Admin, and landing site.
The changes form one coordinated release but remain atomic per repository.

## Backend

- Extend cart quote metadata with the already-resolved delivery policy values so
  clients do not recalculate branch or zone rules.
- Normalize cuisine count and detail visibility around one repository predicate.
- Extend legacy coupon input to the same multi-scope contract already used by
  promotions; persist join-table scopes in the repository layer.
- Treat `maxDiscountAmount <= 0` as uncapped and exclude Happy Hour from scheduled
  carts/orders.
- Add filter/range-aware report totals and return currency explicitly.
- Restrict restaurant payment-method mutation to `SUPER_ADMIN`; retain read access
  for restaurant admins.
- Emit restaurant-scoped order-status events after successful state transitions.

## Customer storefront

- Remove homepage distance labels.
- Render cart media conditionally.
- Reuse strict address validation in guest and saved-address flows.
- Represent guest contact errors per field and render accessible error states.
- Display backend delivery policy metadata in the mini cart.
- Render explicit rejected/cancelled terminal order states.

## Restaurant Admin

- Align coupon/Happy Hour editors with the promotion audience and multi-scope UI.
- Lift report period and filters into the page-level query state so summary and
  charts cannot diverge.
- Format all order/report amounts through the shared currency formatter.
- Make restaurant payment settings read-only.
- Replace one-shot notification audio with a keyed pending-order alert manager;
  persist its user preferences locally and stop alerts on status events.
- Add concise printing guidance beside existing manual/auto-print controls.

## Super Admin and landing

- Surface existing per-restaurant PayPal provider controls from the restaurant
  management flow.
- Restore form controls for every field in the current landing content schema,
  preserving bilingual content and managed images.

## Failure handling

- Quote metadata is optional for backward compatibility.
- Invalid or absent product media hides the image without breaking the cart row.
- Notification audio failure does not block order toasts.
- Repeated order/status events are idempotent by order ID.
- Report filters default to the current existing range when absent.
