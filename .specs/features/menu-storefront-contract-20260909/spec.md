# FeastFlow menu-to-storefront contract journey — 2026-09-09

Status: Implementing (test-first, isolated, no live impact)

## Scope
Partner-side menu management (Restaurant Admin panel) to public storefront contract (customer-app API), verified end-to-end over real HTTP against a disposable PostgreSQL database.

## Acceptance IDs

- **MS-01 Partner menu creation reflects on storefront**
  Business Admin creates restaurant menu, category, and item (with variation + price). Storefront `GET /customer-app/branches/:branchId/items` (and category listing) returns the item with matching name, price, and category for the same tenant.

- **MS-02 Branch-scoped availability override**
  With two branches of the same restaurant, marking an item unavailable at Branch B via branch-override hides it from Branch B storefront listings while it remains visible at Branch A.

- **MS-03 Branch price override reflected on storefront**
  Setting a `priceOverride` on an item at a branch changes the storefront-reported price at that branch only; the other branch keeps the base price.

- **MS-04 Unavailable item ordering denial**
  Adding an item made unavailable at a branch to the cart / placing an order for that item at that branch is denied with a proper error envelope (4xx, `success: false`), never a silent success.

- **MS-05 Soft-deleted / unpublished item non-disclosure**
  A deleted or deactivated menu item disappears from all storefront listing and detail endpoints and its detail lookup 404s.

- **MS-06 Cross-tenant storefront isolation**
  Tenant B's customer app context never returns Tenant A's items, categories, or branch stats (reuse MT-RBAC fixtures).

- **MS-07 Variation and modifier contract integrity**
  Storefront item detail returns variations and modifier groups with correct price deltas; ordering a variation price overridden at branch level uses the overridden price in the order total.

## Constraints
- No application source changes expected; test-only phase. Any contract bug found becomes a separate fix task with Boss approval.
- Reuse the isolated-DB P0 harness pattern (`test/p0-env.ts`, disposable Postgres container).
- Full regression + lint + tsc + build must pass before push.

## Out of scope
Payments, coupons, delivery, notifications (later roadmap phases).

