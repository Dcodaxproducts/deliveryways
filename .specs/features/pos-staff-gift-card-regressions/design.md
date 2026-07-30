# POS, Staff Customer Access, and Gift Card Regression Design

## Authorization

The shared RolesGuard remains the authorization source. Customer routes map to
Customer Management. Read-only customer list/detail routes additionally accept POS
Management so POS can populate its selector. Route handlers include STAFF, while
service-level tenant/restaurant lookup remains authoritative for record scope.

Customer mutation routes do not map to POS Management.

## Gift Card Delivery

The public purchase contract carries both `buyerEmail` and `recipientEmail`.
Provider metadata persists both before Stripe confirmation. The payment-success
webhook fulfills the gift card transactionally, then sends the recipient email and
persists a sent timestamp in provider metadata.

If fulfillment is already paid but the sent timestamp is absent, a repeated Stripe
success event reuses the stored gift card code and retries only the email.

## Presentation

- POS keeps the existing datetime-local value contract and declares a 24-hour locale.
- Order address preview distinguishes DELIVERY, DINE_IN, and takeaway/pickup.
- Role dialog height is viewport-bounded with vertical scrolling.
- Storefront hours summary localizes the semantic closed state at render time.

## Invariants

- POS access never grants customer update, status, or delete operations.
- Staff queries remain tenant/restaurant assignment-scoped.
- Gift-card email is never sent before successful Stripe fulfillment.
- Webhook retries never create a second gift card for an already-paid transaction.
