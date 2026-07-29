# Client Regression Batch — Design

**Spec:** `.specs/features/client-regression-batch-20260729/spec.md`
**Status:** Approved from explicit client requirements

## Architecture

- Reuse the existing staff `RolesGuard` context and restaurant/branch assignment
  model. Order services validate the actual order restaurant/branch against the
  assigned scope; they do not trust a client-supplied restaurant ID.
- Reuse public menu-item detail APIs for Deal customization. Compact category
  results identify candidates; selected items are hydrated with their full
  variation/modifier graph before configuration and cart submission.
- Reuse the existing backend cart/POS checkout contract. POS UI owns branch,
  customer/contact, and payment inputs; the backend remains the source of truth
  for quote and checkout.
- Keep manual payout requests in Restaurant Admin but remove provider credential
  submission. Global and restaurant provider configuration live in Super Admin.
- Reuse the existing AES-256-GCM payout credential encryption service. Extend the
  encrypted envelope for global Stripe/PayPal secrets rather than storing raw
  values in settings JSON.
- Storefront order type/address remains in the existing restaurant-scoped
  client state; backend quote remains authoritative for order-type pricing.

## Components and Reuse

| Area | Existing component/service | Design |
| --- | --- | --- |
| Staff orders | `OrdersService`, `RolesGuard` | Add staff-aware order/branch assertions and grouped permission coverage. |
| Deal options | `useDealEligibleItems`, `useDealScopedItemsDetails` | Hydrate every selected category item before showing configuration. |
| POS | Existing POS cart/services and backend cart endpoints | Repair defaults, lookup, contact inputs, payload, and tests. |
| Payouts | Existing payout provider requests/encryption | Move credential ownership to Super Admin and add global encrypted config. |
| Gift Cards | Existing homepage and purchase services | Prove/repair guest online-only flow. |
| Localization | Existing `next-intl` EN/DE catalogs | Replace literals and verify key parity. |

## Security Invariants

- No staff access outside assigned restaurant/branch or owner tenant.
- No provider secret is logged, serialized, or returned.
- Masked secret placeholders never become stored secrets.
- Gift Cards cannot be purchased through COD, card-on-delivery, bank transfer,
  or wallet.
- All money/distance decimals remain numeric at API boundaries.

## Error Handling

| Scenario | Result |
| --- | --- |
| Staff order outside assignment | `Forbidden` without leaking order data |
| Deal item detail unavailable | Disable submit and show an actionable option-load error |
| POS contact missing | Inline validation before checkout |
| Provider secret invalid | Reject update; preserve previous encrypted secret |
| No online Gift Card method | Disable purchase and explain configuration issue |
