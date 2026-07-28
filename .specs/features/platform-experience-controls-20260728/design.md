# DeliveryWay Platform Experience Controls Design

## Architecture

This batch extends existing bounded contexts and JSON-backed settings. It does
not introduce a page-builder service, a second invoice system, or new runtime
infrastructure.

### Order placement

`OrdersService` continues to persist the order and invoke the Notifications
module. The Notifications module persists the in-app admin notification and
emits the realtime event before returning, while outbound customer/admin email
delivery runs as a caught best-effort promise. Delivery status remains recorded
by the existing notification dispatch path.

### Branch order email

Branch notification settings live in `Branch.settings.notificationSettings`
using the same `emailAddress` and `notificationTypes.newOrder.email` contract as
restaurant settings. An authenticated branch endpoint reads/updates only this
small settings slice. New-order recipient resolution checks branch settings
first and falls back to restaurant settings.

### Campaign audience

Add `CouponAudience` (`GUEST`, `REGISTERED`, `BOTH`) to Prisma and `Coupon` with
`BOTH` as the database default. Campaign write DTOs expose the enum. Public
campaign reads and coupon/deal validation derive an audience from the current
user: anonymous and `isGuest` users are guests; other authenticated customers
are registered.

### Managed homepage

Extend `GlobalSetting.landingPageSettings` with a typed, optional `home` object:

- hero copy/image/CTA
- selected featured restaurant IDs
- two existing feature/checklist section configurations
- app-download section copy/image/store links
- visibility and ordering fields for the managed sections

The public landing-settings endpoint returns normalized, sanitized data.
Superadmin edits this shape in the existing Landing Content screen. Landing
combines it with active public restaurant records and uses current localized
assets/copy whenever a field is absent.

### Generated invoices

Keep `GeneratedInvoice` as the history source. Add one authorized document
endpoint addressed by generated-invoice ID. It resolves the existing order,
subscription, or payout document path from the stored kind/snapshot/source
references and records a download event. Superadmin and Restaurant Admin use
that endpoint for view/download actions. Existing restaurant/branch scoping
remains in the list and document authorization paths.

### Restaurant Admin UI

Change static metadata to `Restaurant Admin`, remove Customer Info from the
orders list rendering, expose branch new-order email controls, and reuse the
existing invoice-history screen with the generic document action.

## Data Compatibility

- `Coupon.audience` defaults to `BOTH`, so all existing rows retain their
  behavior.
- Homepage settings are optional JSON fields; existing saved settings continue
  to normalize and current Landing constants remain fallbacks.
- Branch notification settings are optional; absent settings preserve the
  restaurant-level recipient behavior.

## Failure Behavior

- SMTP failure is recorded/logged and never changes a successfully persisted
  order.
- Audience mismatch returns the existing invalid/not-applicable coupon error
  contract.
- Missing or unsupported invoice sources return a clear not-found/unavailable
  response.
- Unauthorized restaurant/branch invoice or settings access is rejected before
  document generation or mutation.

## Verification

- Focused backend unit tests for non-blocking email, branch recipient priority,
  audience filtering/application, homepage normalization, and invoice access.
- Backend typecheck/build/tests/lint and repository verification scripts.
- Frontend typecheck/build/tests/lint for each affected app.
- Manual contract checks against rendered DTOs and browser-visible UI.
