# Client Regression Batch — 2026-07-25

## Problem Statement

Production screenshots show inconsistent anonymous checkout/payment behavior and multiple storefront regressions in ordering, customization, pricing, navigation, onboarding, address formatting, footer content, and search.

## P1 User Stories and Acceptance Criteria

1. **REG-01 Category order** — WHEN categories share the same explicit sort order THEN older categories SHALL appear before newly created categories.
2. **REG-02 Item order** — WHEN items share the same explicit sort order THEN older items SHALL appear before newly created items.
3. **REG-03 Item extras** — WHEN a customer opens item customization from a compact card THEN the app SHALL load the full public item detail and display its active extras/modifiers.
4. **REG-04 Card pricing** — WHEN an item has active variations THEN storefront cards SHALL display the lowest effective variation price.
5. **REG-05 Tenant registration** — WHEN a business owner submits onboarding THEN the payload SHALL match `RegisterTenantDto` and SHALL NOT contain `tenant.slug`.
6. **REG-06 Add-on total** — WHEN extras are selected THEN the displayed add-to-cart total SHALL include their effective prices and quantities.
7. **REG-07 Stable cart feedback** — WHEN an item is added optimistically THEN the storefront SHALL remain rendered and reconcile/rollback without a client exception.
8. **REG-08 Guest payments** — WHEN anonymous sessions for the same restaurant/branch open checkout THEN they SHALL resolve the same available methods from domain/branch configuration; legacy empty branch arrays SHALL use checkout defaults.
9. **REG-09 Account menu** — WHEN a silent guest opens navigation THEN Login plus order/notification/help links SHALL be available; WHEN a real customer opens it THEN account links plus Logout SHALL be available.
10. **REG-10 Address formatting** — WHEN optional address fields contain blanks or punctuation-only placeholders THEN output SHALL contain no duplicate commas.
11. **REG-11 Anonymous footer** — WHEN no account session exists on a restaurant domain THEN footer contact/logo/address SHALL load from public domain context.
12. **REG-12 Search display** — WHEN public search returns a compact active item THEN it SHALL not be labeled inactive merely because `isActive` was omitted, and SHALL show the lowest effective variation price instead of a false zero.

## Out of Scope

- Changing restaurant payout/settlement provider configuration.
- Introducing a localStorage cart alongside the authoritative server cart.
- Database migrations or production data rewrites.

## Success Criteria

- Focused regression tests cover each changed contract.
- Full Backend, Customer, and Landing verification passes.
- Changes are committed and pushed atomically by repository concern.
