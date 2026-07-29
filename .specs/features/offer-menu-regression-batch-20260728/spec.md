# Offer and Menu Regression Batch

## Goal

Extend deal composition without changing legacy deal behavior, and correct the
reported coupon, Happy Hour, menu ordering, allergen/additive, and storefront
presentation regressions.

## Requirements

### Offers

- **OFFER-01** A deal may combine fixed required items and category selection
  groups.
- **OFFER-02** A category selection group may restrict eligibility to explicit
  menu items.
- **OFFER-03** A category selection group may exclude individual items.
- **OFFER-04** Each group defines an exact required quantity.
- **OFFER-05** A customer may select the same eligible item more than once.
- **OFFER-06** Deal ordering is persisted and exposed consistently.
- **OFFER-07** Existing deals without groups retain their current pricing and
  selection behavior.
- **OFFER-08** Server-side cart and order validation enforce the same group
  rules presented by the Customer UI.

### Coupons and Happy Hours

- **COUPON-01** Authorized admins can delete coupons, with tenant and restaurant
  access checks preserved.
- **HAPPY-01** Active Happy Hours are returned for the customer homepage.
- **HAPPY-02** Active state respects date range, active weekdays, daily time
  range, overnight ranges, and restaurant timezone.
- **HAPPY-03** Customer presentation stops automatically at the next schedule
  boundary without requiring navigation or a manual reload.

### Menu management and storefront

- **MENU-01** Item drag-and-drop persists the complete ordered list and the
  Product Items page requests the persisted order.
- **MENU-02** Category selection scrolls to the requested category once its
  section is rendered.
- **INFO-01** Product information exposes allergen/additive content and the eye
  action whenever data exists.
- **INFO-02** Admin selection lists show `Code + Label`; customer product info
  shows only the label.
- **INFO-03** Allergen/additive types use deterministic configured ordering.
- **ITEM-01** Missing descriptions remain empty; no invented default copy is
  rendered.
- **ITEM-02** Product images remain optional and no-image cards use a clean
  text-first layout.

### Email delivery

- **EMAIL-01** SMTP connections fail within a bounded timeout instead of
  leaving customer/admin workflows waiting indefinitely.
- **EMAIL-02** Port 587 configurations require authenticated STARTTLS.
- **EMAIL-03** Development and production credentials authenticate and the
  provider accepts a health-check message.

## Invariants

- Ordinary cart items are never inferred as deals.
- Deal pricing is accepted only for an explicit deal payload.
- Tenant, restaurant, and staff permission boundaries are unchanged.
- Existing deal records do not require destructive backfill.
- Sorting never changes prices, availability, or ownership.

## Acceptance

Every requirement has a focused regression test. Backend, Restaurant Admin,
and Customer pass typecheck, lint, tests, and production builds. The migration
applies cleanly to an empty PostgreSQL 16 scratch database.
