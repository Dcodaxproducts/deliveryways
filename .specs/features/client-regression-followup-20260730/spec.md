# DeliveryWay client regression follow-up — 2026-07-30

## Scope

Correct the nine regressions reported from the Restaurant Admin, POS, and Customer storefront without changing database schema or widening tenant/branch access.

## Requirements

### REG-01 — Deal-form helper removal

- The fixed-price deal item selector must not render the “Select at least 2 menu items…” helper.
- Existing validation that prevents an invalid deal submission remains intact.

### REG-02 — Stable deal item selection

- Selecting a customer deal item must not remove it or its sibling items from the category list.
- Hydrated menu-item details must preserve a nested category identifier when the flat `categoryId` field is absent.
- Existing deal item option/modifier hydration remains available.

### REG-03 — POS payment-method scope

- POS must show only payment methods effective for the cart’s restaurant and branch.
- Effective methods are the intersection already enforced by the order quote: platform, restaurant, and branch configuration.
- POS must not silently fall back to all payment methods when the effective list is unavailable.

### REG-04 — Staff branch-management writes

- Active staff with Branch Management write/update permission may edit an assigned branch, its opening hours, delivery hours, delivery timing, images, holiday hours, and temporary closure.
- Staff access must continue to reject unassigned restaurants and branches.
- Legacy staff tokens carrying `staffRoleId` remain recognized.

### REG-05 — POS customer-address creation

- An authorized admin using POS can create a delivery address for the selected registered customer.
- The target customer and optional branch must be validated within the admin’s tenant/restaurant/branch scope.
- Customers cannot create addresses for other customers.
- The saved address becomes available for selection without reloading the POS page.

### REG-06 — Accurate role total

- Employee Settings “Total Roles” must count all non-deleted roles in the current admin scope, including roles with zero assigned employees.
- Employee role breakdown remains based on employee assignments.

### REG-07 — Employee password edit visibility

- The edit-employee modal prefills the stored visible employee password returned by the API.
- Password hashes must never be displayed.

### REG-08 — Staff order invoice and branch navigation

- Order Management staff must reach Order Invoice History through the Orders page and `kind=ORDER` API contract.
- Branch Management staff must reach and use branch edit/opening/delivery-hour flows covered by REG-04.

### REG-09 — German localization

- Customer-facing “Opens at”, “selected”, “Required”, add-on selection guidance (including “Select up to 3 add-ons”), and distance “away” text must render through English/German translations.
- English and German message trees remain structurally identical.

## Out of scope

- Database migrations.
- Production deployment.
- Revealing password hashes or adding password recovery behavior.
- Changing configured payment methods.

## Acceptance proof

- Focused regression tests for every requirement.
- Backend typecheck, build, test, lint, Prisma validation, and enforcement checks.
- Restaurant Admin and Customer full tests, typecheck, lint, production builds, import checks, and i18n parity.

